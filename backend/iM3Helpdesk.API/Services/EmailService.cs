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
  private readonly IEmailTemplateRenderer _templates;
 
  public EmailService(
      IConfiguration config,
      IServiceScopeFactory scopeFactory,
      ICurrentTenantService tenantService,
      ILogger<EmailService> logger,
      IEmailTemplateRenderer templates)
  {
    _config = config;
    _scopeFactory = scopeFactory;
    _tenantService = tenantService;
    _logger = logger;
    _templates = templates;
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

    var content = _templates.Render("email-verification",
        new Dictionary<string, string?>
        {
          ["full_name"] = fullName,
          ["org_name"] = orgName,
          ["verify_link"] = verifyLink,
        });

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
    var content = _templates.Render("welcome",
        new Dictionary<string, string?>
        {
          ["full_name"] = fullName,
          ["company_name"] = companyName,
        });

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

    var content = _templates.Render("forgot-password",
        new Dictionary<string, string?>
        {
          ["full_name"] = fullName,
          ["reset_link"] = resetLink,
          ["org_name"] = orgName,
        });

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

    var content = _templates.Render("agent-invite",
        new Dictionary<string, string?>
        {
          ["agent_name"] = agentName,
          ["org_name"] = orgName,
          ["to"] = to,
          ["temp_password"] = tempPassword,
          ["base_url"] = baseUrl,
        });

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

    var content = _templates.Render("ticket-created",
        new Dictionary<string, string?>
        {
          ["customer_name"] = customerName,
          ["ticket_title"] = ticketTitle,
          ["ticket_number"] = ticketNumber,
          ["category"] = category,
          ["priority"] = priority,
          ["priority_color"] = priorityColor,
          ["org_name"] = orgName,
        });

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

    var content = _templates.Render("ticket-status-changed",
        new Dictionary<string, string?>
        {
          ["customer_name"] = customerName,
          ["ticket_title"] = ticketTitle,
          ["ticket_number"] = ticketNumber,
          ["old_status"] = oldStatus,
          ["new_status"] = newStatus,
          ["status_color"] = statusColor,
          ["status_emoji"] = statusEmoji,
          ["message_for_status"] = messageForStatus,
          ["org_name"] = orgName,
        });

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

    var content = _templates.Render("ticket-assigned",
        new Dictionary<string, string?>
        {
          ["agent_name"] = agentName,
          ["ticket_title"] = ticketTitle,
          ["ticket_number"] = ticketNumber,
          ["customer_name"] = customerName,
          ["priority"] = priority,
          ["priority_color"] = priorityColor,
          ["org_name"] = orgName,
        });

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
    var content = _templates.Render("ticket-merged",
        new Dictionary<string, string?>
        {
          ["customer_name"] = customerName,
          ["merged_ticket_number"] = mergedTicketNumber,
          ["original_ticket_number"] = originalTicketNumber,
          ["original_ticket_title"] = originalTicketTitle,
          ["org_name"] = orgName,
        });

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
    var content = _templates.Render("otp",
        new Dictionary<string, string?>
        {
          ["full_name"] = fullName,
          ["otp"] = otp,
        });
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

    var descriptionRow = string.IsNullOrEmpty(eventDescription)
        ? string.Empty
        : _templates.Render(
            "partials/calendar-reminder-description-row",
            new Dictionary<string, string?>
            {
              ["event_description"] = eventDescription,
            });

    var ticketRow = string.IsNullOrEmpty(ticketNumber)
        ? string.Empty
        : _templates.Render(
            "partials/calendar-reminder-ticket-row",
            new Dictionary<string, string?>
            {
              ["ticket_number"] = ticketNumber,
            });

    var html = _templates.Render("calendar-reminder",
        new Dictionary<string, string?>
        {
          ["type_icon"] = typeIcon,
          ["event_title"] = eventTitle,
          ["time_label"] = timeLabel,
          ["date_str"] = dateStr,
          ["time_str"] = timeStr,
          ["description_row"] = descriptionRow,
          ["ticket_row"] = ticketRow,
          ["attendee_name"] = attendeeName,
          ["org_name"] = orgName,
        });

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

    var descriptionRow = string.IsNullOrEmpty(eventDescription)
        ? string.Empty
        : _templates.Render(
            "partials/calendar-invite-description-row",
            new Dictionary<string, string?>
            {
              ["event_description"] = eventDescription,
            });

    var html = _templates.Render("calendar-invite",
        new Dictionary<string, string?>
        {
          ["type_icon"] = typeIcon,
          ["event_title"] = eventTitle,
          ["event_type_upper"] = eventType.ToUpper(),
          ["organizer_name"] = organizerName,
          ["org_name"] = orgName,
          ["date_str"] = dateStr,
          ["time_str"] = timeStr,
          ["end_str"] = endStr,
          ["description_row"] = descriptionRow,
          ["attendee_name"] = attendeeName,
        });

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

    var titleStyleExtra = isCancel
        ? "text-decoration:line-through;opacity:.6"
        : "";

    var html = _templates.Render("calendar-event-updated",
        new Dictionary<string, string?>
        {
          ["icon"] = icon,
          ["label"] = label,
          ["label_lower"] = label.ToLower(),
          ["color"] = color,
          ["event_title"] = eventTitle,
          ["date_str"] = dateStr,
          ["title_style_extra"] = titleStyleExtra,
          ["attendee_name"] = attendeeName,
          ["org_name"] = orgName,
        });

    await SendAsync(
        to,
        $"{icon} Event {label}: {eventTitle}",
        html,
        organizationId: organizationId);
  }
 
  // ════════════════════════════════════
  // Master HTML Template wrapper
  // ════════════════════════════════════
  private string WrapInMasterTemplate(
      string content, string orgName)
  {
    return _templates.Render("_master",
        new Dictionary<string, string?>
        {
          ["content"] = content,
          ["org_name"] = orgName,
        });
  }
}