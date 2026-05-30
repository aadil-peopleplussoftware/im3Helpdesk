using MailKit.Net.Smtp;
using MimeKit;
using MimeKit.Utils;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MailKit.Security;
using System.Net;
using System.Text.RegularExpressions;
using iM3Helpdesk.Application.Contracts.Services;

namespace iM3Helpdesk.Infrastructure.Services;

public class EmailService : IEmailService
{
  private sealed record SmtpProfile(
      string Host,
      int Port,
      string Username,
      string Password,
      string FromEmail,
      string FromName);
 
  private readonly IConfiguration _config;
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly ICurrentTenantService _tenantService;
  private readonly ILogger<EmailService> _logger;
 
  public EmailService(
      IConfiguration config,
      IServiceScopeFactory scopeFactory,
      ICurrentTenantService tenantService,
      ILogger<EmailService> logger)
  {
    _config = config;
    _scopeFactory = scopeFactory;
    _tenantService = tenantService;
    _logger = logger;
  }
 
  private static SmtpProfile? BuildOrgSmtpProfile(
      Organization? organization)
  {
    if (organization == null)
      return null;
 
    var fromEmail = FirstNonEmpty(
        organization.SmtpFromEmail,
        organization.SupportEmail,
        organization.SmtpUsername);
    var username = FirstNonEmpty(
        organization.SmtpUsername,
        fromEmail);
    var host = organization.SmtpHost?.Trim();
    var password = organization.SmtpPassword?.Trim();
 
    if (string.IsNullOrWhiteSpace(host) ||
        string.IsNullOrWhiteSpace(fromEmail) ||
        string.IsNullOrWhiteSpace(username) ||
        string.IsNullOrWhiteSpace(password))
    {
      return null;
    }
 
    return new SmtpProfile(
        host,
        organization.SmtpPort ?? 587,
        username,
        password,
        fromEmail,
        FirstNonEmpty(
            organization.SmtpFromName,
            organization.Name,
            "DeskMate")!);
  }
 
  private SmtpProfile? BuildFallbackSmtpProfile()
  {
    var smtp = _config.GetSection("SmtpSettings");
    var fromEmail = FirstNonEmpty(
        smtp["FromEmail"],
        smtp["Username"]);
    var username = FirstNonEmpty(
        smtp["Username"],
        fromEmail);
    var host = smtp["Host"]?.Trim();
    var password = smtp["Password"]?.Trim();
 
    if (string.IsNullOrWhiteSpace(host) ||
        string.IsNullOrWhiteSpace(fromEmail) ||
        string.IsNullOrWhiteSpace(username) ||
        string.IsNullOrWhiteSpace(password))
    {
      return null;
    }
 
    return new SmtpProfile(
        host,
        smtp.GetValue<int>("Port", 587),
        username,
        password,
        fromEmail,
        FirstNonEmpty(
            smtp["FromName"],
            "DeskMate")!);
  }
 
  private async Task<SmtpProfile?> ResolveSmtpProfileAsync(
      Guid? organizationId)
  {
    var effectiveOrganizationId =
        organizationId ?? _tenantService.OrganizationId;
 
    if (effectiveOrganizationId.HasValue)
    {
      using var scope = _scopeFactory.CreateScope();
      var context = scope.ServiceProvider
          .GetRequiredService<ApplicationDbContext>();
 
      var organization = await context.Organizations
          .IgnoreQueryFilters()
          .AsNoTracking()
          .FirstOrDefaultAsync(o =>
              o.Id == effectiveOrganizationId.Value);
 
      var organizationProfile = BuildOrgSmtpProfile(organization);
      if (organizationProfile != null)
        return organizationProfile;
 
      if (organization != null)
      {
        _logger.LogWarning(
            "Organization {OrganizationId} SMTP settings are incomplete; falling back to appsettings SMTP.",
            effectiveOrganizationId.Value);
      }
    }
 
    var fallbackProfile = BuildFallbackSmtpProfile();
    if (fallbackProfile == null)
    {
      _logger.LogWarning(
          "No usable SMTP profile found for organization {OrganizationId}.",
          effectiveOrganizationId);
    }
 
    return fallbackProfile;
  }
 
  private static string? FirstNonEmpty(params string?[] values)
  {
    return values.FirstOrDefault(value =>
        !string.IsNullOrWhiteSpace(value))?.Trim();
  }
 
  // ════════════════════════════════════
  // Core send method
  // ════════════════════════════════════
  public async Task SendAsync(
      string to,
      string subject,
      string htmlBody,
      string? replyTo = null,
      Guid? organizationId = null,
      bool wrapInMasterTemplate = true,
      string? ticketNumberTag = null)
  {
    await SendInternalAsync(
        to, subject, htmlBody, replyTo,
        organizationId, wrapInMasterTemplate,
        cc: null, bcc: null,
        inReplyTo: null, references: null,
        ticketNumberTag: ticketNumberTag);
  }

  // ════════════════════════════════════
  // Internal send (cc/bcc + threading)
  // ════════════════════════════════════
  private async Task<string?> SendInternalAsync(
      string to,
      string subject,
      string htmlBody,
      string? replyTo,
      Guid? organizationId,
      bool wrapInMasterTemplate,
      IEnumerable<string>? cc,
      IEnumerable<string>? bcc,
      string? inReplyTo,
      IEnumerable<string>? references,
      string? ticketNumberTag = null,
      string? fromDisplayName = null)
  {
    var smtpProfile = await ResolveSmtpProfileAsync(organizationId);
    if (smtpProfile == null)
      return null;

    var msg = new MimeMessage();
    msg.From.Add(new MailboxAddress(
        string.IsNullOrWhiteSpace(fromDisplayName)
            ? smtpProfile.FromName
            : fromDisplayName,
        smtpProfile.FromEmail));
    msg.To.Add(MailboxAddress.Parse(to));
    AddRecipients(msg.Cc, cc);
    AddRecipients(msg.Bcc, bcc);
    msg.Subject = subject;

    if (replyTo != null)
      msg.ReplyTo.Add(MailboxAddress.Parse(replyTo));

    // ── Generate our own Message-Id BEFORE send so we can persist the
    // exact value the recipient will see. (Gmail SMTP can rewrite an
    // auto-generated id, but it preserves an explicitly-set one.)
    msg.MessageId = MimeUtils.GenerateMessageId("im3helpdesk.local");

    // ── Custom anchor header (survives all reply paths) ──
    if (!string.IsNullOrWhiteSpace(ticketNumberTag))
      msg.Headers.Add("X-iM3-Ticket", ticketNumberTag);

    // ── RFC 5322 threading headers ───────────────
    if (!string.IsNullOrWhiteSpace(inReplyTo))
      msg.InReplyTo = NormalizeMessageId(inReplyTo);

    if (references != null)
    {
      foreach (var r in references)
      {
        if (string.IsNullOrWhiteSpace(r)) continue;
        msg.References.Add(NormalizeMessageId(r));
      }
    }

    _logger.LogInformation(
        "[Email-Out] To={To} Subj=\"{Subj}\" MsgId={MsgId} InReplyTo={IRT} RefCount={RC}",
        to, subject, msg.MessageId, inReplyTo ?? "(none)",
        msg.References?.Count ?? 0);

    var finalHtml = wrapInMasterTemplate
      ? WrapInMasterTemplate(htmlBody, smtpProfile.FromName)
      : htmlBody;

    var body = new BodyBuilder { HtmlBody = finalHtml };
    msg.Body = body.ToMessageBody();

    using var client = new SmtpClient();
    await client.ConnectAsync(
        smtpProfile.Host,
        smtpProfile.Port,
        SecureSocketOptions.StartTls);
    await client.AuthenticateAsync(
        smtpProfile.Username,
        smtpProfile.Password);
    await client.SendAsync(msg);
    await client.DisconnectAsync(true);

    return msg.MessageId; // outbound Message-Id for thread chain
  }

  private static void AddRecipients(
      InternetAddressList list,
      IEnumerable<string>? addresses)
  {
    if (addresses == null) return;
    foreach (var a in addresses)
    {
      if (string.IsNullOrWhiteSpace(a)) continue;
      if (MailboxAddress.TryParse(a.Trim(), out var mb))
        list.Add(mb);
    }
  }

  private static string NormalizeMessageId(string id)
  {
    id = id.Trim();
    if (id.StartsWith("<") && id.EndsWith(">"))
      return id.Substring(1, id.Length - 2);
    return id;
  }

  // ════════════════════════════════════
  // ✅ Email Verification
  // ════════════════════════════════════
  public async Task SendEmailVerificationAsync(
      string to,
      string fullName,
      string verificationToken,
      string orgName = "DeskMate",
      Guid? organizationId = null)
  {
    // Read base URL from config, fallback to localhost
    var baseUrl = _config["AppSettings:BaseUrl"]
        ?? "http://localhost:4200";
 
    var verifyLink =
        $"{baseUrl}/verify-email?token={verificationToken}";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  ✉️ Verify Your Email Address
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{fullName}</strong>,
  welcome to {orgName}! Please verify your email address
  to activate your account.
</p>
 
<div style='text-align:center;margin:32px 0'>
  <a href='{verifyLink}'
    style='background:#2563eb;color:white;
      padding:14px 32px;border-radius:8px;
      text-decoration:none;font-size:15px;
      font-weight:600;display:inline-block'>
    ✅ Verify Email Address
  </a>
</div>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:8px;padding:16px;margin-bottom:24px;
  font-size:12px;color:#6b7280'>
  <strong>Link not working?</strong> Copy and paste this URL in your browser:<br/>
  <span style='color:#2563eb;word-break:break-all'>
    {verifyLink}
  </span>
</div>
 
<p style='font-size:12px;color:#9ca3af;text-align:center;margin:0'>
  This link will expire in 24 hours. If you didn't create
  an account, you can safely ignore this email.
</p>";
 
    await SendAsync(
        to,
        $"✉️ Verify your email — {orgName}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // ✅ Welcome Email (after registration)
  // ════════════════════════════════════
  public async Task SendWelcomeEmailAsync(
      string to,
      string fullName,
      string companyName,
      Guid? organizationId = null)
  {
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🎉 Welcome to DeskMate!
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{fullName}</strong>,
  your organization <strong>{companyName}</strong>
  has been successfully created.
</p>
 
<div style='background:#f0fdf4;border:1px solid #86efac;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='font-size:14px;font-weight:600;
    color:#15803d;margin-bottom:12px'>
    ✅ Your account is ready!
  </div>
  <ul style='margin:0;padding-left:20px;
    font-size:13px;color:#374151;line-height:2'>
    <li>Manage support tickets</li>
    <li>Invite agents to your team</li>
    <li>Track SLA and performance</li>
    <li>Automate email-to-ticket conversion</li>
  </ul>
</div>
 
<div style='background:#eff6ff;border:1px solid #bfdbfe;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#1e40af;margin-bottom:24px'>
  ℹ️ You have a <strong>30-day free trial</strong>.
  Explore all features without any commitment.
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  DeskMate Support Team
</p>";
 
    await SendAsync(
        to,
        $"🎉 Welcome to DeskMate — {companyName}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // ✅ Forgot Password
  // ════════════════════════════════════
  public async Task SendForgotPasswordAsync(
      string to,
      string fullName,
      string resetToken,
      string orgName = "DeskMate",
      Guid? organizationId = null)
  {
    var baseUrl = _config["AppSettings:BaseUrl"]
        ?? "http://localhost:4200";
 
    var resetLink =
        $"{baseUrl}/reset-password?token={resetToken}";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🔐 Reset Your Password
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{fullName}</strong>,
  we received a request to reset your password.
  Click the button below to set a new one.
</p>
 
<div style='text-align:center;margin:32px 0'>
  <a href='{resetLink}'
    style='background:#dc2626;color:white;
      padding:14px 32px;border-radius:8px;
      text-decoration:none;font-size:15px;
      font-weight:600;display:inline-block'>
    🔐 Reset Password
  </a>
</div>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:8px;padding:16px;margin-bottom:24px;
  font-size:12px;color:#6b7280'>
  <strong>Link not working?</strong> Copy and paste this URL:<br/>
  <span style='color:#2563eb;word-break:break-all'>
    {resetLink}
  </span>
</div>
 
<div style='background:#fef2f2;border:1px solid #fecaca;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#b91c1c;margin-bottom:24px'>
  ⚠️ This link expires in <strong>1 hour</strong>.
  If you didn't request a password reset,
  please ignore this email — your account is safe.
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  {orgName} Security Team
</p>";
 
    await SendAsync(
        to,
        $"🔐 Password Reset Request — {orgName}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // ✅ Agent Invite (with temp password)
  // ════════════════════════════════════
  public async Task SendAgentInviteAsync(
      string to,
      string agentName,
      string orgName,
      string tempPassword,
      Guid? organizationId = null)
  {
    var baseUrl = _config["AppSettings:BaseUrl"]
        ?? "http://localhost:4200";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🎧 You've Been Invited!
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{agentName}</strong>,
  you have been invited to join
  <strong>{orgName}</strong> as a support agent
  on DeskMate.
</p>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='font-size:12px;color:#9ca3af;
    text-transform:uppercase;letter-spacing:0.5px;
    margin-bottom:16px'>
    YOUR LOGIN CREDENTIALS
  </div>
 
  <div style='margin-bottom:12px'>
    <span style='font-size:12px;color:#6b7280'>
      Email Address:
    </span><br/>
    <span style='font-size:15px;font-weight:600;
      color:#1a1f36'>
      {to}
    </span>
  </div>
 
  <div style='background:#fefce8;border:1px solid #fde68a;
    border-radius:8px;padding:12px 16px'>
    <span style='font-size:12px;color:#92400e'>
      Temporary Password:
    </span><br/>
    <span style='font-size:18px;font-weight:700;
      color:#b45309;font-family:monospace;
      letter-spacing:2px'>
      {tempPassword}
    </span>
  </div>
</div>
 
<div style='text-align:center;margin:24px 0'>
  <a href='{baseUrl}/login'
    style='background:#2563eb;color:white;
      padding:14px 32px;border-radius:8px;
      text-decoration:none;font-size:15px;
      font-weight:600;display:inline-block'>
    🚀 Login to DeskMate
  </a>
</div>
 
<div style='background:#fef3c7;border:1px solid #fde68a;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#b45309;margin-bottom:16px'>
  ⚡ Please change your password after first login
  for security purposes.
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  {orgName} · DeskMate
</p>";
 
    await SendAsync(
        to,
        $"🎧 You're invited to join {orgName} on DeskMate",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Agent reply to customer
  // ════════════════════════════════════
  public async Task<string?> SendReplyAsync(
      string to,
      string subject,
      string htmlBody,
      string ticketNumber,
      string agentName,
      string agentSignature,
      Guid? organizationId = null,
      IEnumerable<string>? cc = null,
      IEnumerable<string>? bcc = null,
      string? inReplyTo = null,
      IEnumerable<string>? references = null)
  {
    // Gmail / Outlook thread by Message-Id headers + normalized subject.
    // Adding a tag like "[#TN1008]" changes the normalized subject and
    // forces a new thread even when In-Reply-To/References are correct.
    // Keep the subject identical to the original (only the "Re: " prefix
    // is added when missing). The ticket-number tag stays in the body /
    // ticket lookup is done via Message-Id chain instead.
    var fullSubject = subject.StartsWith("Re:",
        StringComparison.OrdinalIgnoreCase)
      ? subject
      : $"Re: {subject}";

    var content = PrepareReplyBody(htmlBody);

    return await SendInternalAsync(
        to,
        fullSubject,
        content,
        replyTo: null,
        organizationId: organizationId,
        wrapInMasterTemplate: false,
        cc: cc,
        bcc: bcc,
        inReplyTo: inReplyTo,
        references: references,
        ticketNumberTag: ticketNumber);
  }

  // ════════════════════════════════════
  // Forward to another agent / external
  // ════════════════════════════════════
  public async Task<string?> SendForwardAsync(
      string to,
      string subject,
      string htmlBody,
      Guid? organizationId = null,
      IEnumerable<string>? cc = null,
      IEnumerable<string>? bcc = null,
      string? inReplyTo = null,
      IEnumerable<string>? references = null,
      string? fromDisplayName = null)
  {
    return await SendInternalAsync(
        to,
        subject,
        htmlBody,
        replyTo: null,
        organizationId: organizationId,
        wrapInMasterTemplate: false,
        cc: cc,
        bcc: bcc,
        inReplyTo: inReplyTo,
        references: references,
        fromDisplayName: fromDisplayName);
  }
 
  private static readonly Regex HtmlTagRegex = new(
      "<[^>]+>",
      RegexOptions.Compiled);

  // Detect HTML entities (&nbsp; &amp; &#39; etc.) so an entity-only body
  // (e.g. "Thanks Brother&nbsp;") is not double-encoded into "&amp;nbsp;".
  private static readonly Regex HtmlEntityRegex = new(
      @"&(?:[a-zA-Z]{2,8}|#\d{1,5}|#x[0-9a-fA-F]{1,4});",
      RegexOptions.Compiled);

  private static string PrepareReplyBody(string? body)
  {
    if (string.IsNullOrWhiteSpace(body))
      return "<p>(No content)</p>";

    var trimmed = body.Trim();
    // Treat as HTML if it has any tag OR any HTML entity.
    if (HtmlTagRegex.IsMatch(trimmed) ||
        HtmlEntityRegex.IsMatch(trimmed))
      return trimmed;

    var encoded = WebUtility.HtmlEncode(trimmed)
        .Replace("\r\n", "<br>")
        .Replace("\n", "<br>")
        .Replace("\r", "<br>");
    return $"<p>{encoded}</p>";
  }
 
  // ════════════════════════════════════
  // Ticket Created (to customer)
  // ════════════════════════════════════
  public async Task SendTicketCreatedAsync(
      string to,
      string customerName,
      string ticketTitle,
      string ticketNumber,
      string category,
      string priority,
      string orgName,
      Guid? organizationId = null)
  {
    var priorityColor =
        priority == "Critical" ? "#dc2626"
        : priority == "High" ? "#f59e0b"
        : priority == "Medium" ? "#2563eb"
        : "#22c55e";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  Ticket Received ✅
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{customerName}</strong>,
  your ticket has been submitted successfully.
</p>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='display:flex;align-items:flex-start;
    justify-content:space-between;margin-bottom:12px'>
    <div>
      <div style='font-size:12px;color:#9ca3af;
        text-transform:uppercase;letter-spacing:0.5px;
        margin-bottom:4px'>TICKET NUMBER</div>
      <div style='font-size:22px;font-weight:700;
        color:#2563eb'>{ticketNumber}</div>
    </div>
    <div style='background:{priorityColor}20;
      color:{priorityColor};padding:4px 14px;
      border-radius:20px;font-size:12px;font-weight:600'>
      {priority} Priority
    </div>
  </div>
  <div style='border-top:1px solid #e5e7eb;
    padding-top:16px'>
    <div style='font-size:13px;font-weight:600;
      color:#1a1f36;margin-bottom:6px'>{ticketTitle}</div>
    <div style='font-size:12px;color:#9ca3af'>
      Category: {category}
    </div>
  </div>
</div>
 
<div style='background:#eff6ff;border:1px solid #bfdbfe;
  border-radius:8px;padding:16px;
  font-size:13px;color:#1e40af;margin-bottom:24px'>
  <strong>⏱ What happens next?</strong><br/>
  Our support team will review your ticket and get back
  to you as soon as possible. You can reply to this
  email to add more information.
</div>
 
<p style='font-size:13px;color:#6b7280;
  text-align:center;margin:0'>
  Support provided by <strong>{orgName}</strong>
</p>";
 
    await SendAsync(
        to,
        $"✅ Ticket {ticketNumber} Created — {ticketTitle}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Status Changed (to customer)
  // ════════════════════════════════════
  public async Task SendTicketStatusChangedAsync(
      string to,
      string customerName,
      string ticketTitle,
      string ticketNumber,
      string oldStatus,
      string newStatus,
      string orgName,
      Guid? organizationId = null)
  {
    var statusColor =
        newStatus == "Resolved" ? "#22c55e"
        : newStatus == "Closed" ? "#6b7280"
        : newStatus == "InProgress" ? "#f59e0b"
        : "#2563eb";
 
    var statusEmoji =
        newStatus == "Resolved" ? "✅"
        : newStatus == "Closed" ? "🔒"
        : newStatus == "InProgress" ? "⚙️"
        : "📋";
 
    var messageForStatus =
        newStatus == "Resolved"
        ? "Great news! Your ticket has been resolved. If you're still experiencing issues, please reply to reopen it."
        : newStatus == "Closed"
        ? "Your ticket has been closed. Thank you for contacting us!"
        : newStatus == "InProgress"
        ? "Your ticket is now being actively worked on by our team."
        : "Your ticket status has been updated.";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  {statusEmoji} Ticket Status Updated
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{customerName}</strong>,
  the status of your ticket has changed.
</p>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='font-size:12px;color:#9ca3af;
    text-transform:uppercase;letter-spacing:0.5px;
    margin-bottom:4px'>TICKET</div>
  <div style='font-size:15px;font-weight:600;
    color:#1a1f36;margin-bottom:16px'>
    {ticketNumber} — {ticketTitle}
  </div>
  <div style='display:flex;align-items:center;gap:12px'>
    <div style='background:#f3f4f6;color:#6b7280;
      padding:6px 16px;border-radius:20px;
      font-size:13px;font-weight:500'>{oldStatus}</div>
    <div style='color:#9ca3af;font-size:16px'>→</div>
    <div style='background:{statusColor}20;
      color:{statusColor};padding:6px 16px;
      border-radius:20px;font-size:13px;font-weight:600;
      border:1px solid {statusColor}40'>
      {statusEmoji} {newStatus}
    </div>
  </div>
</div>
 
<div style='background:#f0fdf4;border:1px solid #86efac;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#15803d;margin-bottom:24px'>
  {messageForStatus}
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  {orgName} Support Team
</p>";
 
    await SendAsync(
        to,
        $"{statusEmoji} Ticket {ticketNumber} — Status: {newStatus}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Ticket Assigned (to agent)
  // ════════════════════════════════════
  public async Task SendTicketAssignedAsync(
      string agentEmail,
      string agentName,
      string ticketTitle,
      string ticketNumber,
      string customerName,
      string priority,
      string orgName,
      Guid? organizationId = null)
  {
    var priorityColor =
        priority == "Critical" ? "#dc2626"
        : priority == "High" ? "#f59e0b"
        : priority == "Medium" ? "#2563eb"
        : "#22c55e";
 
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🎧 New Ticket Assigned
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{agentName}</strong>,
  a ticket has been assigned to you.
</p>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='display:flex;align-items:flex-start;
    justify-content:space-between;margin-bottom:16px'>
    <div>
      <div style='font-size:12px;color:#9ca3af;
        margin-bottom:4px'>TICKET NUMBER</div>
      <div style='font-size:22px;font-weight:700;
        color:#2563eb'>{ticketNumber}</div>
    </div>
    <div style='background:{priorityColor}20;
      color:{priorityColor};padding:4px 14px;
      border-radius:20px;font-size:12px;font-weight:600'>
      {priority}
    </div>
  </div>
  <div style='border-top:1px solid #e5e7eb;
    padding-top:16px;display:flex;
    flex-direction:column;gap:8px'>
    <div>
      <span style='font-size:12px;color:#9ca3af'>
        Subject:
      </span>
      <span style='font-size:13px;font-weight:600;
        color:#1a1f36'>{ticketTitle}</span>
    </div>
    <div>
      <span style='font-size:12px;color:#9ca3af'>
        Customer:
      </span>
      <span style='font-size:13px;color:#374151'>
        {customerName}
      </span>
    </div>
  </div>
</div>
 
<div style='background:#fef3c7;border:1px solid #fde68a;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#b45309;margin-bottom:16px'>
  ⚡ Please review and respond to this ticket
  at your earliest convenience.
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  {orgName} Helpdesk System
</p>";
 
    await SendAsync(
        agentEmail,
        $"🎧 Assigned: {ticketNumber} — {ticketTitle}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Ticket Merged (to customer)
  // ════════════════════════════════════
  public async Task SendTicketMergedAsync(
      string to,
      string customerName,
      string mergedTicketNumber,
      string originalTicketNumber,
      string originalTicketTitle,
      string orgName,
      Guid? organizationId = null)
  {
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🔀 Tickets Merged
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{customerName}</strong>,
  we've merged a duplicate ticket.
</p>
 
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:12px;padding:20px 24px;margin-bottom:24px'>
  <div style='margin-bottom:16px'>
    <div style='font-size:12px;color:#9ca3af;
      margin-bottom:6px'>CLOSED (Duplicate)</div>
    <div style='font-size:16px;font-weight:600;
      color:#6b7280;text-decoration:line-through'>
      {mergedTicketNumber}
    </div>
  </div>
  <div style='display:flex;justify-content:center;
    color:#9ca3af;font-size:20px;margin:8px 0'>↓</div>
  <div>
    <div style='font-size:12px;color:#9ca3af;
      margin-bottom:6px'>ACTIVE TICKET (Original)</div>
    <div style='font-size:18px;font-weight:700;
      color:#2563eb'>{originalTicketNumber}</div>
    <div style='font-size:13px;color:#374151;
      margin-top:4px'>{originalTicketTitle}</div>
  </div>
</div>
 
<div style='background:#eff6ff;border:1px solid #bfdbfe;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#1e40af;margin-bottom:16px'>
  ℹ️ Your issue is still being worked on under ticket
  <strong>{originalTicketNumber}</strong>.
  Please use that ticket number for all future correspondence.
</div>
 
<p style='font-size:12px;color:#9ca3af;
  text-align:center;margin:0'>
  {orgName} Support Team
</p>";
 
    await SendAsync(
        to,
        $"🔀 Ticket {mergedTicketNumber} merged into {originalTicketNumber}",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // ✅ OTP Login Email
  // ════════════════════════════════════
  public async Task SendOtpEmailAsync(
      string to,
      string fullName,
      string otp,
      Guid? organizationId = null)
  {
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🔐 Your Login OTP
</h2>
<p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
  Hi <strong>{fullName}</strong>,
  use the code below to complete your login.
</p>
<div style='text-align:center;margin:32px 0'>
  <div style='display:inline-block;
    background:linear-gradient(135deg,#1d4ed8,#2563eb);
    border-radius:16px;padding:28px 48px'>
    <div style='font-size:11px;color:#93c5fd;
      text-transform:uppercase;letter-spacing:2px;
      margin-bottom:8px'>One-Time Password</div>
    <div style='font-size:42px;font-weight:800;
      color:white;letter-spacing:12px;
      font-family:monospace'>
      {otp}
    </div>
  </div>
</div>
<div style='background:#fef3c7;border:1px solid #fde68a;
  border-radius:8px;padding:14px 16px;
  font-size:13px;color:#b45309;margin-bottom:24px;
  text-align:center'>
  ⏱ This OTP expires in <strong>5 minutes</strong>.
  Do not share it with anyone.
</div>
<div style='background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:8px;padding:14px 16px;
  font-size:12px;color:#6b7280'>
  If you didn't request this, your account may be at risk.
  Please change your password immediately.
</div>";
    await SendAsync(
        to,
        "🔐 Your DeskMate Login OTP",
        content,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Calendar — Reminder Email
  // ════════════════════════════════════
  public async Task SendCalendarReminderAsync(
      string to,
      string attendeeName,
      string eventTitle,
      string eventType,
      string eventDescription,
      DateTime startDate,
      int minutesBefore,
      string? ticketNumber,
      string orgName,
      Guid? organizationId = null)
  {
    var typeIcon = eventType switch
    {
      "reminder" => "🔔",
      "meeting" => "👥",
      "deadline" => "⏰",
      "ticket" => "🎫",
      _ => "📅"
    };
 
    var timeLabel = minutesBefore switch
    {
      < 60 => $"{minutesBefore} minutes",
      1440 => "1 day",
      2880 => "2 days",
      var m => $"{m / 60} hours"
    };
 
    var dateStr = startDate.ToString("dddd, MMMM d, yyyy");
    var timeStr = startDate.ToString("hh:mm tt") + " UTC";
 
    var html = $@"
      <h2 style='margin:0 0 8px;font-size:20px;
        color:#1f2937;font-weight:700'>
        {typeIcon} Reminder: {eventTitle}
      </h2>
      <p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
        This event starts in <strong>{timeLabel}</strong>
      </p>
 
      <table width='100%' cellpadding='0' cellspacing='0'
        style='background:#f8fafc;border-radius:10px;
          padding:20px;margin-bottom:24px'>
        <tr>
          <td style='padding:6px 0'>
            <span style='color:#6b7280;font-size:12px;
              text-transform:uppercase;letter-spacing:.05em'>
              Event
            </span>
            <div style='font-size:15px;font-weight:600;
              color:#1f2937;margin-top:2px'>
              {typeIcon} {eventTitle}
            </div>
          </td>
        </tr>
        <tr>
          <td style='padding:6px 0'>
            <span style='color:#6b7280;font-size:12px;
              text-transform:uppercase;letter-spacing:.05em'>
              Date &amp; Time
            </span>
            <div style='font-size:15px;color:#1f2937;margin-top:2px'>
              📅 {dateStr} at {timeStr}
            </div>
          </td>
        </tr>
        {(string.IsNullOrEmpty(eventDescription) ? "" : $@"
        <tr>
          <td style='padding:6px 0'>
            <span style='color:#6b7280;font-size:12px;
              text-transform:uppercase;letter-spacing:.05em'>
              Notes
            </span>
            <div style='font-size:14px;color:#374151;margin-top:2px'>
              {eventDescription}
            </div>
          </td>
        </tr>")}
        {(string.IsNullOrEmpty(ticketNumber) ? "" : $@"
        <tr>
          <td style='padding:6px 0'>
            <span style='color:#6b7280;font-size:12px;
              text-transform:uppercase;letter-spacing:.05em'>
              Linked Ticket
            </span>
            <div style='font-size:15px;font-weight:600;
              color:#f59e0b;margin-top:2px'>
              🎫 #{ticketNumber}
            </div>
          </td>
        </tr>")}
      </table>
 
      <p style='color:#9ca3af;font-size:12px;
        text-align:center;margin:0'>
        Hi {attendeeName}, this is your scheduled reminder from
        <strong>{orgName}</strong>.
      </p>";
 
    await SendAsync(
        to,
        $"⏰ Reminder: {eventTitle} — starts in {timeLabel}",
        html,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Calendar — Invite Email (when attendees added)
  // ════════════════════════════════════
  public async Task SendCalendarInviteAsync(
      string to,
      string attendeeName,
      string eventTitle,
      string eventType,
      string eventDescription,
      DateTime startDate,
      DateTime? endDate,
      string organizerName,
      string orgName,
      Guid? organizationId = null)
  {
    var typeIcon = eventType switch
    {
      "reminder" => "🔔",
      "meeting" => "👥",
      "deadline" => "⏰",
      "ticket" => "🎫",
      _ => "📅"
    };
 
    var dateStr = startDate.ToString("dddd, MMMM d, yyyy");
    var timeStr = startDate.ToString("hh:mm tt") + " UTC";
    var endStr = endDate.HasValue
        ? " – " + endDate.Value.ToString("hh:mm tt") + " UTC"
        : "";
 
    var html = $@"
      <h2 style='margin:0 0 6px;font-size:20px;
        color:#1f2937;font-weight:700'>
        {typeIcon} You've been invited
      </h2>
      <p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
        <strong>{organizerName}</strong> has added you to an event
        in <strong>{orgName}</strong>
      </p>
 
      <table width='100%' cellpadding='0' cellspacing='0'
        style='background:#f8fafc;border-radius:10px;
          border-left:4px solid #2563eb;
          padding:20px;margin-bottom:24px'>
        <tr>
          <td style='padding:8px 0'>
            <div style='font-size:18px;font-weight:700;
              color:#1f2937;margin-bottom:4px'>
              {typeIcon} {eventTitle}
            </div>
            <div style='font-size:13px;color:#6b7280'>
              {eventType.ToUpper()}
            </div>
          </td>
        </tr>
        <tr>
          <td style='padding:8px 0;
            border-top:1px solid #e5e7eb'>
            <div style='font-size:14px;color:#374151'>
              📅 <strong>{dateStr}</strong>
            </div>
            <div style='font-size:14px;color:#374151;margin-top:2px'>
              🕐 {timeStr}{endStr}
            </div>
          </td>
        </tr>
        {(string.IsNullOrEmpty(eventDescription) ? "" : $@"
        <tr>
          <td style='padding:8px 0;
            border-top:1px solid #e5e7eb'>
            <div style='font-size:13px;color:#374151'>
              {eventDescription}
            </div>
          </td>
        </tr>")}
      </table>
 
      <p style='color:#6b7280;font-size:13px;text-align:center;margin:0'>
        Hi {attendeeName}, this invite was sent by
        <strong>{organizerName}</strong> via {orgName}.
      </p>";
 
    await SendAsync(
        to,
        $"{typeIcon} Invited: {eventTitle} on {dateStr}",
        html,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Calendar — Event Updated / Cancelled
  // ════════════════════════════════════
  public async Task SendCalendarEventUpdatedAsync(
      string to,
      string attendeeName,
      string eventTitle,
      DateTime startDate,
      string changeType,
      string orgName,
      Guid? organizationId = null)
  {
    var isCancel = changeType == "cancelled";
    var icon = isCancel ? "❌" : "✏️";
    var label = isCancel ? "Cancelled" : "Updated";
    var color = isCancel ? "#ef4444" : "#f59e0b";
    var dateStr = startDate.ToString("dddd, MMMM d, yyyy");
 
    var html = $@"
      <h2 style='margin:0 0 8px;font-size:20px;
        color:{color};font-weight:700'>
        {icon} Event {label}
      </h2>
      <p style='color:#6b7280;font-size:14px;margin:0 0 24px'>
        An event you were invited to has been <strong>{label.ToLower()}</strong>.
      </p>
 
      <table width='100%' cellpadding='0' cellspacing='0'
        style='background:#f8fafc;border-radius:10px;
          border-left:4px solid {color};
          padding:20px;margin-bottom:24px'>
        <tr>
          <td>
            <div style='font-size:16px;font-weight:600;
              color:#1f2937;
              {(isCancel ? "text-decoration:line-through;opacity:.6" : "")}'>
              {eventTitle}
            </div>
            <div style='font-size:13px;color:#6b7280;margin-top:4px'>
              📅 {dateStr}
            </div>
          </td>
        </tr>
      </table>
 
      <p style='color:#9ca3af;font-size:12px;
        text-align:center;margin:0'>
        Hi {attendeeName}, this notification was sent by
        <strong>{orgName}</strong>.
      </p>";
 
    await SendAsync(
        to,
        $"{icon} Event {label}: {eventTitle}",
        html,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Master HTML Template wrapper
  // ════════════════════════════════════
  private static string WrapInMasterTemplate(
      string content, string orgName)
  {
    return $@"<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'/>
  <meta name='viewport'
    content='width=device-width,initial-scale=1.0'/>
  <title>DeskMate</title>
</head>
<body style='margin:0;padding:0;
  background-color:#f3f4f6;
  font-family:Arial,-apple-system,
    BlinkMacSystemFont,sans-serif'>
 
  <table width='100%' cellpadding='0'
    cellspacing='0' border='0'
    style='background:#f3f4f6;padding:30px 0'>
    <tr>
      <td align='center'>
        <table width='600' cellpadding='0'
          cellspacing='0' border='0'
          style='max-width:600px;width:100%'>
 
          <!-- Header -->
          <tr>
            <td style='background:linear-gradient(
                135deg,#1d4ed8,#2563eb);
              border-radius:12px 12px 0 0;
              padding:24px 32px'>
              <table width='100%' cellpadding='0'
                cellspacing='0' border='0'>
                <tr>
                  <td>
                    <span style='color:white;
                      font-size:20px;font-weight:700;
                      letter-spacing:-0.5px'>
                      ⚡ DeskMate
                    </span>
                  </td>
                  <td align='right'>
                    <span style='color:#93c5fd;
                      font-size:12px'>
                      Support System
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
 
          <!-- Body -->
          <tr>
            <td style='background:white;
              padding:32px;
              border-left:1px solid #e5e7eb;
              border-right:1px solid #e5e7eb'>
              {content}
            </td>
          </tr>
 
          <!-- Footer -->
          <tr>
            <td style='background:#f9fafb;
              border:1px solid #e5e7eb;
              border-top:none;
              border-radius:0 0 12px 12px;
              padding:16px 32px;text-align:center'>
              <p style='margin:0;font-size:11px;
                color:#9ca3af;line-height:1.6'>
                This email was sent by
                <strong>{orgName}</strong>
                via DeskMate.<br/>
                Please do not reply directly unless
                responding to a ticket.
              </p>
              <p style='margin:8px 0 0;font-size:11px;
                color:#d1d5db'>
                Powered by
                <strong style='color:#2563eb'>
                  DeskMate
                </strong>
              </p>
            </td>
          </tr>
 
        </table>
      </td>
    </tr>
  </table>
 
</body>
</html>";
  }
}