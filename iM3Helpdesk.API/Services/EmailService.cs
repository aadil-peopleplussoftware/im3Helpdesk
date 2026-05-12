using MailKit.Net.Smtp;
using MimeKit;
using Microsoft.Extensions.Configuration;

namespace iM3Helpdesk.Infrastructure.Services;

public interface IEmailService
{
  // Core send
  Task SendAsync(
      string to,
      string subject,
      string htmlBody,
      string? replyTo = null);

  // Agent reply to customer
  Task SendReplyAsync(
      string to,
      string subject,
      string htmlBody,
      string ticketNumber,
      string agentName,
      string agentSignature);

  // Ticket lifecycle emails
  Task SendTicketCreatedAsync(
      string to,
      string customerName,
      string ticketTitle,
      string ticketNumber,
      string category,
      string priority,
      string orgName);

  Task SendTicketStatusChangedAsync(
      string to,
      string customerName,
      string ticketTitle,
      string ticketNumber,
      string oldStatus,
      string newStatus,
      string orgName);

  Task SendTicketAssignedAsync(
      string agentEmail,
      string agentName,
      string ticketTitle,
      string ticketNumber,
      string customerName,
      string priority,
      string orgName);

  Task SendTicketMergedAsync(
      string to,
      string customerName,
      string mergedTicketNumber,
      string originalTicketNumber,
      string originalTicketTitle,
      string orgName);

  // ✅ NEW — Auth emails
  Task SendEmailVerificationAsync(
      string to,
      string fullName,
      string verificationToken,
      string orgName = "iM3 Helpdesk");

  Task SendWelcomeEmailAsync(
      string to,
      string fullName,
      string companyName);

  Task SendForgotPasswordAsync(
      string to,
      string fullName,
      string resetToken,
      string orgName = "iM3 Helpdesk");

  Task SendAgentInviteAsync(
      string to,
      string agentName,
      string orgName,
      string tempPassword);

  // ✅ NEW — OTP Login
  Task SendOtpEmailAsync(
      string to,
      string fullName,
      string otp);

  // ── Calendar emails ──────────────────────────────────────────────

  Task SendCalendarReminderAsync(
      string to,
      string attendeeName,
      string eventTitle,
      string eventType,
      string eventDescription,
      DateTime startDate,
      int minutesBefore,
      string? ticketNumber,
      string orgName);

  Task SendCalendarInviteAsync(
      string to,
      string attendeeName,
      string eventTitle,
      string eventType,
      string eventDescription,
      DateTime startDate,
      DateTime? endDate,
      string organizerName,
      string orgName);

  Task SendCalendarEventUpdatedAsync(
      string to,
      string attendeeName,
      string eventTitle,
      DateTime startDate,
      string changeType,  // "updated" | "cancelled"
      string orgName);
}

public class EmailService : IEmailService
{
  private readonly IConfiguration _config;

  public EmailService(IConfiguration config)
  {
    _config = config;
  }

  // ════════════════════════════════════
  // Core send method
  // ════════════════════════════════════
  public async Task SendAsync(
      string to,
      string subject,
      string htmlBody,
      string? replyTo = null)
  {
    var smtp = _config.GetSection("SmtpSettings");
    var fromEmail = smtp["FromEmail"] ?? "";
    var fromName = smtp["FromName"] ?? "iM3 Helpdesk";
    var password = smtp["Password"] ?? "";
    var host = smtp["Host"] ?? "smtp.gmail.com";
    var port = smtp.GetValue<int>("Port", 587);

    if (string.IsNullOrEmpty(fromEmail) ||
        string.IsNullOrEmpty(password))
      return;

    var msg = new MimeMessage();
    msg.From.Add(new MailboxAddress(fromName, fromEmail));
    msg.To.Add(MailboxAddress.Parse(to));
    msg.Subject = subject;

    if (replyTo != null)
      msg.ReplyTo.Add(MailboxAddress.Parse(replyTo));

    var wrappedHtml = WrapInMasterTemplate(htmlBody, fromName);
    var body = new BodyBuilder { HtmlBody = wrappedHtml };
    msg.Body = body.ToMessageBody();

    using var client = new SmtpClient();
    await client.ConnectAsync(
        host, port,
        MailKit.Security.SecureSocketOptions.StartTls);
    await client.AuthenticateAsync(fromEmail, password);
    await client.SendAsync(msg);
    await client.DisconnectAsync(true);
  }

  // ════════════════════════════════════
  // ✅ Email Verification
  // ════════════════════════════════════
  public async Task SendEmailVerificationAsync(
      string to,
      string fullName,
      string verificationToken,
      string orgName = "iM3 Helpdesk")
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
        content);
  }

  // ════════════════════════════════════
  // ✅ Welcome Email (after registration)
  // ════════════════════════════════════
  public async Task SendWelcomeEmailAsync(
      string to,
      string fullName,
      string companyName)
  {
    var content = $@"
<h2 style='color:#1a1f36;font-size:20px;margin:0 0 6px'>
  🎉 Welcome to iM3 Helpdesk!
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
  iM3 Helpdesk Support Team
</p>";

    await SendAsync(
        to,
        $"🎉 Welcome to iM3 Helpdesk — {companyName}",
        content);
  }

  // ════════════════════════════════════
  // ✅ Forgot Password
  // ════════════════════════════════════
  public async Task SendForgotPasswordAsync(
      string to,
      string fullName,
      string resetToken,
      string orgName = "iM3 Helpdesk")
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
        content);
  }

  // ════════════════════════════════════
  // ✅ Agent Invite (with temp password)
  // ════════════════════════════════════
  public async Task SendAgentInviteAsync(
      string to,
      string agentName,
      string orgName,
      string tempPassword)
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
  on iM3 Helpdesk.
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
    🚀 Login to iM3 Helpdesk
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
  {orgName} · iM3 Helpdesk
</p>";

    await SendAsync(
        to,
        $"🎧 You're invited to join {orgName} on iM3 Helpdesk",
        content);
  }

  // ════════════════════════════════════
  // Agent reply to customer
  // ════════════════════════════════════
  public async Task SendReplyAsync(
      string to,
      string subject,
      string htmlBody,
      string ticketNumber,
      string agentName,
      string agentSignature)
  {
    var fullSubject = $"Re: {subject} [{ticketNumber}]";

    var content = $@"
<h2 style='color:#1a1f36;font-size:18px;margin:0 0 16px'>
  New Reply on {ticketNumber}
</h2>

<div style='background:#f9fafb;
  border-left:4px solid #2563eb;
  padding:16px 20px;border-radius:0 8px 8px 0;
  margin-bottom:24px;
  font-size:14px;line-height:1.7;color:#374151'>
  {htmlBody}
</div>

{(!string.IsNullOrEmpty(agentSignature)
  ? $@"<div style='border-top:1px solid #e5e7eb;
        padding-top:16px;margin-top:8px;
        font-size:13px;color:#6b7280'>
        {agentSignature}
      </div>"
  : $@"<div style='border-top:1px solid #e5e7eb;
        padding-top:16px;font-size:13px;
        color:#6b7280'>
        <strong>{agentName}</strong><br/>
        iM3 Helpdesk Support
      </div>")}

<div style='margin-top:24px;padding:14px 16px;
  background:#f0f9ff;border-radius:8px;
  border:1px solid #bae6fd;
  font-size:12px;color:#0369a1;text-align:center'>
  💬 Reply to this email to continue the conversation
  on ticket <strong>{ticketNumber}</strong>
</div>";

    await SendAsync(to, fullSubject, content);
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
      string orgName)
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
        content);
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
      string orgName)
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
        content);
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
      string orgName)
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
        content);
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
      string orgName)
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
        content);
  }

  // ════════════════════════════════════
  // ✅ OTP Login Email
  // ════════════════════════════════════
  public async Task SendOtpEmailAsync(
      string to,
      string fullName,
      string otp)
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
        "🔐 Your iM3 Helpdesk Login OTP",
        content);
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
      string orgName)
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
        html);
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
      string orgName)
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
        html);
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
      string orgName)
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
        html);
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
  <title>iM3 Helpdesk</title>
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
                      ⚡ iM3 Helpdesk
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
                via iM3 Helpdesk.<br/>
                Please do not reply directly unless
                responding to a ticket.
              </p>
              <p style='margin:8px 0 0;font-size:11px;
                color:#d1d5db'>
                Powered by
                <strong style='color:#2563eb'>
                  iM3 Helpdesk
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
