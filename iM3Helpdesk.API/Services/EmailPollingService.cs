using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using System.Text.RegularExpressions;

namespace iM3Helpdesk.API.Services;

public class EmailPollingService : BackgroundService
{
  private static readonly Regex TicketNumberRegex =
      new(@"#TN(\d+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

  private static readonly Regex SubjectCleanRegex =
      new(@"^(re:|fwd?:|fw:)\s*", RegexOptions.IgnoreCase | RegexOptions.Compiled);

  private static readonly Regex TagSanitizeRegex =
      new(@"[^a-z0-9\-]", RegexOptions.Compiled);
  private const long MaxAttachmentBytes = 10 * 1024 * 1024;

  private readonly IServiceScopeFactory _scopeFactory;
  private readonly IConfiguration _config;
  private readonly ILogger<EmailPollingService> _logger;
  private readonly DateTime _serviceStartTime = DateTime.UtcNow;

  public EmailPollingService(
      IServiceScopeFactory scopeFactory,
      IConfiguration config,
      ILogger<EmailPollingService> logger)
  {
    _scopeFactory = scopeFactory;
    _config = config;
    _logger = logger;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    _logger.LogInformation(
        "✉ Email Polling started at {T}", _serviceStartTime);

    // Wait 15s on startup before first poll
    await Task.Delay(15_000, stoppingToken);

    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        await PollAllOrgsAsync(stoppingToken);
      }
      catch (OperationCanceledException) { break; }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Email polling top-level error");
      }

      try
      {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
      }
      catch (OperationCanceledException) { break; }
    }

    _logger.LogInformation("✉ Email Polling stopped");
  }

  private async Task PollAllOrgsAsync(CancellationToken ct)
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();

    var orgs = await context.Organizations
        .IgnoreQueryFilters()
        .Where(o => o.IsActive && !string.IsNullOrEmpty(o.SupportEmail))
        .ToListAsync(ct);

    if (!orgs.Any())
    {
      _logger.LogInformation("No active orgs with support email configured");
      return;
    }

    _logger.LogInformation("Polling {N} org(s)", orgs.Count);

    // ✅ Read SMTP config ONCE — reuse for all orgs
    var smtp = _config.GetSection("SmtpSettings");
    var imapHost = smtp["ImapHost"];
    var imapPort = smtp.GetValue<int>("ImapPort", 993);
    var inboxEmail = smtp["FromEmail"];
    var password = smtp["Password"];

    if (string.IsNullOrEmpty(imapHost) ||
        string.IsNullOrEmpty(inboxEmail) ||
        string.IsNullOrEmpty(password))
    {
      _logger.LogWarning("IMAP config missing in appsettings — skipping poll");
      return;
    }

    // ✅ Connect ONCE to IMAP, process emails for all orgs
    using var client = new ImapClient();

    try
    {
      await client.ConnectAsync(imapHost, imapPort, true, ct);
      await client.AuthenticateAsync(inboxEmail, password, ct);

      var inbox = client.Inbox;
      await inbox.OpenAsync(FolderAccess.ReadWrite, ct);

      _logger.LogInformation("IMAP connected — {N} total messages", inbox.Count);

      var since = _serviceStartTime.AddMinutes(-1);
      var query = SearchQuery.And(
          SearchQuery.NotSeen,
          SearchQuery.DeliveredAfter(since));

      var uids = await inbox.SearchAsync(query, ct);
      _logger.LogInformation(
          "Unread emails since {Since}: {N}", since, uids.Count);

      foreach (var uid in uids)
      {
        if (ct.IsCancellationRequested) break;

        try
        {
          var msg = await inbox.GetMessageAsync(uid, ct);

          // ✅ Extra guard: skip emails before service start
          if (msg.Date.UtcDateTime < _serviceStartTime.AddMinutes(-5))
          {
            _logger.LogDebug(
                "Skipping old email dated {D}", msg.Date);
            continue;
          }

          // ✅ Match email to an org by TO address
          var matchedOrg = FindMatchingOrg(msg, orgs, inboxEmail);

          if (matchedOrg == null)
          {
            _logger.LogWarning(
                "No org matched for TO: {T}", msg.To);
            continue;
          }

          await ProcessEmailAsync(msg, matchedOrg, context, ct);

          // Mark as read only after successful processing
          await inbox.AddFlagsAsync(uid, MessageFlags.Seen, true, ct);

          _logger.LogInformation(
              "✅ Processed email for org: {O}", matchedOrg.Name);
        }
        catch (Exception ex)
        {
          _logger.LogError(ex, "Error processing uid {U}", uid);
        }
      }

      await client.DisconnectAsync(true, ct);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "IMAP connection failed: {M}", ex.Message);
      try
      {
        if (client.IsConnected)
          await client.DisconnectAsync(false, ct);
      }
      catch { /* ignore disconnect errors */ }
    }
  }
  private static Organization? FindMatchingOrg(
      MimeMessage message,
      List<Organization> orgs,
      string inboxEmail)
  {
    var toAddresses = message.To.Mailboxes
        .Select(m => m.Address?.ToLower() ?? "")
        .Where(a => !string.IsNullOrEmpty(a))
        .ToList();
    var ccAddresses = message.Cc.Mailboxes
        .Select(m => m.Address?.ToLower() ?? "")
        .ToList();

    var allAddresses = toAddresses
        .Concat(ccAddresses)
        .ToList();
    foreach (var org in orgs)
    {
      var supportEmail =
          org.SupportEmail?.ToLower() ?? "";
      if (string.IsNullOrEmpty(supportEmail))
        continue;
      if (allAddresses.Contains(supportEmail))
        return org;
      if (allAddresses.Any(a =>
          a.Contains(supportEmail) ||
          supportEmail.Contains(a)))
        return org;
    }

    foreach (var org in orgs)
    {
      var supportEmail =
          org.SupportEmail?.ToLower() ?? "";
      if (inboxEmail.ToLower() == supportEmail)
        return org;
    }
    if (orgs.Count == 1)
      return orgs[0];

    return null;
  }

  private async Task ProcessEmailAsync(
      MimeMessage message,
      Organization org,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var fromBox = message.From.Mailboxes.FirstOrDefault();
    if (fromBox == null)
    {
      _logger.LogWarning("No sender found — skipping");
      return;
    }

    var fromEmail = (fromBox.Address ?? "").Trim();
    if (string.IsNullOrEmpty(fromEmail)) return;

    var fromName = string.IsNullOrEmpty(fromBox.Name)
        ? fromEmail.Split('@')[0]
        : fromBox.Name.Trim();

    var ownEmail = _config["SmtpSettings:FromEmail"] ?? "";
    if (fromEmail.Equals(ownEmail, StringComparison.OrdinalIgnoreCase))
    {
      _logger.LogDebug("Skipping own system email");
      return;
    }

    if (fromEmail.Contains("noreply") ||
        fromEmail.Contains("no-reply") ||
        fromEmail.Contains("notify") ||
        fromEmail.Contains("bounce") ||
        fromEmail.Contains("mailer-daemon"))
    {
      _logger.LogDebug("Skipping automated email: {E}", fromEmail);
      return;
    }

    _logger.LogInformation(
        "Processing email from {E} — Subject: {S}", fromEmail, message.Subject);

    var subject = CleanSubject(message.Subject, fromName);

    var existingTicketId = await FindExistingTicketAsync(
        message, org.Id, fromEmail, context, ct);

    if (existingTicketId.HasValue)
    {
      await AddReplyToTicketAsync(
          message, existingTicketId.Value,
          fromEmail, fromName, org, context, ct);
      return;
    }

    var contact = await UpsertContactAsync(
        fromEmail, fromName, org.Id, null, context, ct);
    // ❌ DISABLED: User auto-creation from email is turned off.
    // Only Contact should be created, not a User account.
    // var customer = await context.Users
    //     .IgnoreQueryFilters()
    //     .FirstOrDefaultAsync(u =>
    //         u.Email.ToLower() == fromEmail.ToLower() &&
    //         u.OrganizationId == org.Id, ct);

    // if (customer == null)
    // {
    //   customer = new User
    //   {
    //     FullName = fromName,
    //     Email = fromEmail,
    //     PhoneNumber = "",
    //     PasswordHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString()),
    //     Role = UserRole.Customer,
    //     OrganizationId = org.Id,
    //     IsEmailVerified = true
    //   };
    //   context.Users.Add(customer);
    //   await context.SaveChangesAsync(ct);
    //   _logger.LogInformation("Auto-created customer: {E}", fromEmail);
    //   if (contact != null)
    //   {
    //     contact.LinkedUserId = customer.Id;
    //     await context.SaveChangesAsync(ct);
    //   }
    // }

    var description = BuildDescription(message);
    var cutoff = DateTime.UtcNow.AddHours(-1);
    var isDuplicate = await context.Tickets
        .IgnoreQueryFilters()
        .AnyAsync(t =>
            t.OrganizationId == org.Id &&
            t.Title == subject &&
            t.CreatedAt >= cutoff, ct);

    if (isDuplicate)
    {
      _logger.LogDebug("Duplicate ticket, skipping: {S}", subject);
      return;
    }
    var lastNum = await context.Tickets
        .IgnoreQueryFilters()
        .Where(t => t.OrganizationId == org.Id)
        .MaxAsync(t => (int?)t.TicketNumber, ct)
        ?? 1000;
    var nameTag = MakeTag(fromName);

    // ✅ FIX: customer removed, use CompanyAdmin as system actor
    var systemUser = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.OrganizationId == org.Id &&
            u.Role == UserRole.CompanyAdmin, ct);

    if (systemUser == null)
    {
      _logger.LogWarning(
          "No CompanyAdmin found for org {O} — cannot create ticket",
          org.Name);
      return;
    }

    var ticket = new Ticket
    {
      Title = subject,
      Description = description,
      Category = "General",
      Priority = TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = "Support",
      OrganizationId = org.Id,
      CreatedByUserId = systemUser.Id, // ✅ CompanyAdmin as system actor
      Tags = $"email,support-email,{nameTag}",
      SlaDeadline = DateTime.UtcNow.AddHours(24),
      SlaStatus = "OnTrack",
      TicketNumber = lastNum + 1
    };

    context.Tickets.Add(ticket);
    await context.SaveChangesAsync(ct);

    _logger.LogInformation(
        "✅ Ticket #TN{N} created for org [{O}]: {S}",
        ticket.TicketNumber, org.Name, subject);
    await SaveAttachmentsAsync(message, ticket, null, context, ct);
    await NotifyAgentsAsync(fromName, subject, ticket, org.Id, context, ct);
  }

  private async Task<Guid?> FindExistingTicketAsync(
      MimeMessage message,
      Guid orgId,
      string fromEmail,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    // 1. Explicit ticket number in subject
    var tnMatch = TicketNumberRegex.Match(message.Subject ?? "");
    if (tnMatch.Success && int.TryParse(tnMatch.Groups[1].Value, out var tnNum))
    {
      var byNumber = await context.Tickets
          .FirstOrDefaultAsync(t =>
              t.OrganizationId == orgId &&
              t.TicketNumber == tnNum, ct);

      if (byNumber != null) return byNumber.Id;
    }

    // 2. Email is a reply (Re: subject or email headers)
    bool isReply =
        (message.Subject ?? "").TrimStart()
            .StartsWith("re:", StringComparison.OrdinalIgnoreCase) ||
        message.InReplyTo != null ||
        message.References.Count > 0;

    if (!isReply) return null;

    // Find customer's most recent open ticket (within 30 days)
    var customer = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == fromEmail.ToLower() &&
            u.OrganizationId == orgId, ct);

    if (customer == null) return null;

    var recentTicket = await context.Tickets
        .Where(t =>
            t.CreatedByUserId == customer.Id &&
            t.OrganizationId == orgId &&
            t.Status != TicketStatus.Closed &&
            t.CreatedAt >= DateTime.UtcNow.AddDays(-30))
        .OrderByDescending(t => t.CreatedAt)
        .FirstOrDefaultAsync(ct);

    return recentTicket?.Id;
  }

  private async Task AddReplyToTicketAsync(
      MimeMessage message,
      Guid ticketId,
      string fromEmail,
      string fromName,
      Organization org,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var user = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == fromEmail.ToLower() &&
            u.OrganizationId == org.Id, ct);

    if (user == null)
    {
      _logger.LogWarning(
          "Reply from unknown user {E} — skipping", fromEmail);
      return;
    }

    var comment = new TicketComment
    {
      TicketId = ticketId,
      UserId = user.Id,
      Comment = BuildDescription(message),
      IsInternal = false,
      OrganizationId = org.Id,
      EmailMessageId = message.MessageId,   // ✅ track for dedup
      Source = "email"              // ✅ mark source
    };

    context.TicketComments.Add(comment);
    await context.SaveChangesAsync(ct);

    // Save any attachments on the reply
    var ticket = await context.Tickets
        .FirstOrDefaultAsync(t => t.Id == ticketId, ct);

    if (ticket != null)
      await SaveAttachmentsAsync(message, ticket, comment.Id, context, ct);

    _logger.LogInformation(
        "💬 Reply added to ticket {T} from {E}", ticketId, fromEmail);
  }

  private static string BuildDescription(MimeMessage message)
  {
    if (!string.IsNullOrEmpty(message.HtmlBody))
      return message.HtmlBody;

    if (!string.IsNullOrEmpty(message.TextBody))
    {
      var encoded = System.Net.WebUtility.HtmlEncode(message.TextBody)
          .Replace("\r\n\r\n", "</p><p>")
          .Replace("\n\n", "</p><p>")
          .Replace("\r\n", "<br>")
          .Replace("\n", "<br>");
      return $"<p>{encoded}</p>";
    }

    return "<p>(No content)</p>";
  }

  private static string CleanSubject(string? raw, string fromName)
  {
    if (string.IsNullOrWhiteSpace(raw))
      return $"Email from {fromName}";

    var clean = SubjectCleanRegex
        .Replace(raw.Trim(), "")
        .Trim();

    return string.IsNullOrEmpty(clean)
        ? $"Email from {fromName}"
        : clean;
  }

  private static string MakeTag(string name)
  {
    var slug = TagSanitizeRegex.Replace(
        name.ToLowerInvariant()
            .Replace(" ", "-")
            .Replace(".", "")
            .Replace("@", ""),
        "");

    return slug.Length > 20 ? slug[..20] : slug;
  }

  private async Task<Contact?> UpsertContactAsync(
      string email,
      string name,
      Guid orgId,
      Guid? userId,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    try
    {
      var existing = await context.Contacts
          .IgnoreQueryFilters()
          .FirstOrDefaultAsync(c =>
              c.Email.ToLower() == email.ToLower() &&
              c.OrganizationId == orgId, ct);

      if (existing == null)
      {
        // Extract company from email domain
        var domain = email.Split('@').LastOrDefault() ?? "";
        var company = IsGenericDomain(domain)
            ? null
            : ExtractCompanyName(domain);

        var contact = new Contact
        {
          FullName = name,
          Email = email,
          Source = "email",
          Company = company,
          OrganizationId = orgId,
          LinkedUserId = userId
        };
        context.Contacts.Add(contact);
        await context.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Contact saved: {E} (company: {C})",
            email, company ?? "none");

        return contact;
      }
      else
      {
        if (existing.FullName != name)
          existing.FullName = name;
        if (userId.HasValue && !existing.LinkedUserId.HasValue)
          existing.LinkedUserId = userId;
        await context.SaveChangesAsync(ct);
        return existing;
      }
    }
    catch (Exception ex)
    {
      _logger.LogWarning("Contact upsert warning: {M}", ex.Message);
      return null;
    }
  }

  private static bool IsGenericDomain(string domain)
  {
    var generic = new[]
    {
      "gmail.com", "yahoo.com", "hotmail.com",
      "outlook.com", "icloud.com", "live.com",
      "msn.com", "aol.com", "protonmail.com",
      "notice.alibaba.com", "alibaba.com"
    };
    return generic.Contains(domain.ToLower());
  }

  private static string ExtractCompanyName(string domain)
  {
    var lower = domain.ToLower();

    // Known multi-part TLDs
    var multiTlds = new[] { "co.in", "co.uk", "com.au", "co.nz", "co.za" };
    foreach (var tld in multiTlds)
    {
      if (lower.EndsWith("." + tld))
      {
        var withoutTld = lower[..^(tld.Length + 1)];
        var parts = withoutTld.Split('.');
        return Capitalize(parts[^1]); // company name before .co.in
      }
    }

    var segments = domain.Split('.');
    if (segments.Length >= 2)
      return Capitalize(segments[^2]);

    return Capitalize(segments[0]);
  }

  private static string Capitalize(string s)
  {
    if (string.IsNullOrEmpty(s)) return s;
    return char.ToUpper(s[0]) + s.Substring(1).ToLower();
  }

  private async Task NotifyAgentsAsync(
      string fromName,
      string subject,
      Ticket ticket,
      Guid orgId,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var agentIds = await context.Users
        .IgnoreQueryFilters()
        .Where(u =>
            u.OrganizationId == orgId &&
            (u.Role == UserRole.Agent ||
             u.Role == UserRole.CompanyAdmin))
        .Select(u => u.Id)
        .ToListAsync(ct);

    foreach (var agentId in agentIds)
    {
      context.Notifications.Add(new Notification
      {
        UserId = agentId,
        OrganizationId = orgId,
        Title = "New Email Ticket",
        Message = $"From {fromName}: {subject}",
        Type = "info",
        TicketId = ticket.Id
      });
    }

    await context.SaveChangesAsync(ct);
  }

  private async Task SaveAttachmentsAsync(
      MimeMessage message,
      Ticket ticket,
      Guid? commentId,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var parts = message.Attachments.OfType<MimePart>().ToList();
    if (!parts.Any()) return;

    var uploadPath = Path.Combine(
        Directory.GetCurrentDirectory(), "wwwroot", "uploads");
    Directory.CreateDirectory(uploadPath);

    foreach (var part in parts)
    {
      if (ct.IsCancellationRequested) break;

      var fileName = part.FileName ?? $"attachment-{Guid.NewGuid()}";
      var ext = Path.GetExtension(fileName).ToLowerInvariant();
      var safeFile = $"{Guid.NewGuid()}{ext}";
      var filePath = Path.Combine(uploadPath, safeFile);

      try
      {
        await using var stream = File.Create(filePath);
        await part.Content.DecodeToAsync(stream, ct);

        var size = new FileInfo(filePath).Length;

        if (size > MaxAttachmentBytes)
        {
          _logger.LogWarning(
              "Attachment {F} too large ({S} bytes) — skipped",
              fileName, size);
          File.Delete(filePath);
          continue;
        }

        context.TicketAttachments.Add(new TicketAttachment
        {
          TicketId = ticket.Id,
          CommentId = commentId,
          FileName = fileName,
          FileUrl = $"/uploads/{safeFile}",
          ContentType = part.ContentType.MimeType,
          FileSize = size,
          UploadedByUserId = ticket.CreatedByUserId,
          OrganizationId = ticket.OrganizationId
        });

        _logger.LogInformation("Attachment saved: {F}", fileName);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Attachment failed: {F}", fileName);

        if (File.Exists(filePath))
          File.Delete(filePath);
      }
    }

    await context.SaveChangesAsync(ct);
  }
}
