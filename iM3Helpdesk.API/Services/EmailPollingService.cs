using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace iM3Helpdesk.API.Services;

public class EmailPollingService : BackgroundService
{
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly IConfiguration _config;
  private readonly ILogger<EmailPollingService> _logger;

  public EmailPollingService(
      IServiceScopeFactory scopeFactory,
      IConfiguration config,
      ILogger<EmailPollingService> logger)
  {
    _scopeFactory = scopeFactory;
    _config = config;
    _logger = logger;
  }

  protected override async Task ExecuteAsync(
      CancellationToken stoppingToken)
  {
    _logger.LogInformation(
        "✉ Email Polling Service started");

    await Task.Delay(15000, stoppingToken);

    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        await PollAllOrgsAsync(stoppingToken);
      }
      catch (OperationCanceledException)
      {
        break;
      }
      catch (Exception ex)
      {
        _logger.LogError(ex,
            "Email polling top-level error");
      }

      try
      {
        await Task.Delay(
            TimeSpan.FromMinutes(2),
            stoppingToken);
      }
      catch (OperationCanceledException)
      {
        break;
      }
    }

    _logger.LogInformation(
        "✉ Email Polling Service stopped");
  }

  private async Task PollAllOrgsAsync(
      CancellationToken ct)
  {
    using var scope =
        _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();

    var orgs = await context.Organizations
        .IgnoreQueryFilters()
        .Where(o => o.IsActive &&
            !string.IsNullOrEmpty(o.SupportEmail))
        .ToListAsync(ct);

    _logger.LogInformation(
        "Found {N} orgs to poll", orgs.Count);

    foreach (var org in orgs)
    {
      if (ct.IsCancellationRequested) break;
      try
      {
        await PollOrgAsync(org, context, ct);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex,
            "Error for org: {Org}", org.Name);
      }
    }
  }

  private async Task PollOrgAsync(
      Organization org,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var smtp = _config.GetSection("SmtpSettings");
    var imapHost = smtp["ImapHost"];
    var imapPort = smtp.GetValue<int>(
        "ImapPort", 993);
    var inboxEmail = smtp["FromEmail"];
    var password = smtp["Password"];

    if (string.IsNullOrEmpty(imapHost) ||
        string.IsNullOrEmpty(inboxEmail) ||
        string.IsNullOrEmpty(password))
    {
      _logger.LogWarning(
          "IMAP not configured");
      return;
    }

    _logger.LogInformation(
        "Connecting IMAP for org: {Org}",
        org.Name);

    using var client = new ImapClient();

    try
    {
      await client.ConnectAsync(
          imapHost, imapPort, true, ct);
      await client.AuthenticateAsync(
          inboxEmail, password, ct);

      var inbox = client.Inbox;
      await inbox.OpenAsync(
          FolderAccess.ReadWrite, ct);

      _logger.LogInformation(
          "IMAP connected. Inbox: {N} messages",
          inbox.Count);

      // Get unseen emails
      var uids = await inbox.SearchAsync(
          SearchQuery.NotSeen, ct);

      _logger.LogInformation(
          "Unread: {N} emails", uids.Count);

      foreach (var uid in uids)
      {
        if (ct.IsCancellationRequested) break;

        try
        {
          var msg = await inbox
              .GetMessageAsync(uid, ct);

          await ProcessEmailAsync(
              msg, org, context, ct);

          // Mark as read after processing
          await inbox.AddFlagsAsync(uid,
              MessageFlags.Seen, true, ct);
        }
        catch (Exception ex)
        {
          _logger.LogError(ex,
              "Error processing uid {U}", uid);
        }
      }

      await client.DisconnectAsync(true, ct);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex,
          "IMAP connect failed: {M}", ex.Message);
      try
      {
        if (client.IsConnected)
          await client.DisconnectAsync(
              false, ct);
      }
      catch { }
    }
  }

  private async Task ProcessEmailAsync(
      MimeMessage message,
      Organization org,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    // ── 1. Parse sender ──────────────────────
    var fromBox = message.From.Mailboxes
        .FirstOrDefault();
    if (fromBox == null)
    {
      _logger.LogWarning("No sender, skip");
      return;
    }

    var fromEmail = fromBox.Address?.Trim() ?? "";
    if (string.IsNullOrEmpty(fromEmail)) return;

    var fromName = string.IsNullOrEmpty(
        fromBox.Name)
        ? fromEmail.Split('@')[0]
        : fromBox.Name.Trim();

    // ── 2. Skip own emails ───────────────────
    var ownEmail =
        _config["SmtpSettings:FromEmail"] ?? "";
    if (fromEmail.Equals(ownEmail,
        StringComparison.OrdinalIgnoreCase))
    {
      _logger.LogDebug("Skipping own email");
      return;
    }

    _logger.LogInformation(
        "Email from: {E} — Subject: {S}",
        fromEmail, message.Subject);

    // ── 3. Check if reply to existing ticket ─
    // Freshdesk style: check message-id references
    var isReply = IsReplyToExistingTicket(message);
    var existingTicketId = await FindExistingTicketAsync(
        message, org.Id, fromEmail, context, ct);

    if (existingTicketId.HasValue && isReply)
    {
      // Add as comment to existing ticket
      await AddReplyToTicketAsync(
          message, existingTicketId.Value,
          fromEmail, fromName, org,
          context, ct);
      return;
    }

    // ── 4. Find or create customer ───────────
    var customer = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() ==
                fromEmail.ToLower() &&
            u.OrganizationId == org.Id, ct);

    if (customer == null)
    {
      customer = new User
      {
        FullName = fromName,
        Email = fromEmail,
        PhoneNumber = "",
        PasswordHash = BCrypt.Net.BCrypt
              .HashPassword(
                  Guid.NewGuid().ToString()),
        Role = UserRole.Customer,
        OrganizationId = org.Id,
        IsEmailVerified = true
      };
      context.Users.Add(customer);
      await context.SaveChangesAsync(ct);
      _logger.LogInformation(
          "Auto-created customer: {E}", fromEmail);
    }

    // ── 5. Upsert Contact ────────────────────
    await UpsertContactAsync(
        fromEmail, fromName, org.Id,
        customer.Id, context, ct);

    // ── 6. Build description ─────────────────
    string description;
    if (!string.IsNullOrEmpty(message.HtmlBody))
    {
      description = message.HtmlBody;
    }
    else if (!string.IsNullOrEmpty(message.TextBody))
    {
      description = "<p>" +
          System.Net.WebUtility.HtmlEncode(
              message.TextBody)
          .Replace("\r\n\r\n", "</p><p>")
          .Replace("\n\n", "</p><p>")
          .Replace("\r\n", "<br>")
          .Replace("\n", "<br>")
          + "</p>";
    }
    else
    {
      description = "<p>(No content)</p>";
    }

    // ── 7. Clean subject ─────────────────────
    var subject = CleanSubject(
        message.Subject, fromName);

    // ── 8. Duplicate check ───────────────────
    var exists = await context.Tickets
        .AnyAsync(t =>
            t.OrganizationId == org.Id &&
            t.CreatedByUserId == customer.Id &&
            t.Title == subject &&
            t.CreatedAt >=
                DateTime.UtcNow.AddHours(-1), ct);

    if (exists)
    {
      _logger.LogDebug(
          "Duplicate, skip: {S}", subject);
      return;
    }

    // ── 9. Build tags ────────────────────────
    var nameTag = MakeTag(fromName);
    var tags = $"email,support-email,{nameTag}";

    // ── 10. Auto ticket number ───────────────
    var lastNum = await context.Tickets
        .IgnoreQueryFilters()
        .Where(t => t.OrganizationId == org.Id)
        .MaxAsync(t => (int?)t.TicketNumber, ct)
        ?? 1000;

    // ── 11. Create ticket ────────────────────
    var ticket = new Ticket
    {
      Title = subject,
      Description = description,
      Category = "General",
      Priority = TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = "Support",
      OrganizationId = org.Id,
      CreatedByUserId = customer.Id,
      Tags = tags,
      SlaDeadline = DateTime.UtcNow.AddHours(24),
      SlaStatus = "OnTrack",
      TicketNumber = lastNum + 1
    };

    context.Tickets.Add(ticket);
    await context.SaveChangesAsync(ct);

    _logger.LogInformation(
        "✅ Ticket #TN{N} created: {S}",
        ticket.TicketNumber, subject);

    // ── 12. Save attachments ─────────────────
    await SaveAttachmentsAsync(
        message, ticket, null, context, ct);

    // ── 13. Notify agents ────────────────────
    await NotifyAgentsAsync(
        fromName, subject,
        ticket, org.Id, context, ct);
  }

  // ── Reply handling ────────────────────────────
  private static bool IsReplyToExistingTicket(
      MimeMessage message)
  {
    return message.InReplyTo != null ||
           message.References.Count > 0;
  }

  private async Task<Guid?> FindExistingTicketAsync(
      MimeMessage message,
      Guid orgId,
      string fromEmail,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    // Look for ticket number in subject
    var subject = message.Subject ?? "";
    var match = System.Text.RegularExpressions
        .Regex.Match(subject,
            @"#TN(\d+)",
            System.Text.RegularExpressions
                .RegexOptions.IgnoreCase);

    if (match.Success &&
        int.TryParse(match.Groups[1].Value,
            out var ticketNum))
    {
      var ticket = await context.Tickets
          .FirstOrDefaultAsync(t =>
              t.OrganizationId == orgId &&
              t.TicketNumber == ticketNum, ct);

      if (ticket != null) return ticket.Id;
    }

    // Look for most recent open ticket from sender
    var customer = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() ==
                fromEmail.ToLower() &&
            u.OrganizationId == orgId, ct);

    if (customer != null)
    {
      var recentTicket = await context.Tickets
          .Where(t =>
              t.CreatedByUserId == customer.Id &&
              t.OrganizationId == orgId &&
              t.Status != TicketStatus.Closed &&
              t.CreatedAt >=
                  DateTime.UtcNow.AddDays(-30))
          .OrderByDescending(t => t.CreatedAt)
          .FirstOrDefaultAsync(ct);

      if (recentTicket != null)
        return recentTicket.Id;
    }

    return null;
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
    // Get user
    var user = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() ==
                fromEmail.ToLower() &&
            u.OrganizationId == org.Id, ct);

    if (user == null) return;

    string body;
    if (!string.IsNullOrEmpty(message.HtmlBody))
      body = message.HtmlBody;
    else if (!string.IsNullOrEmpty(message.TextBody))
      body = "<p>" +
          message.TextBody
              .Replace("\r\n", "<br>")
              .Replace("\n", "<br>")
          + "</p>";
    else
      body = "<p>(No content)</p>";

    var comment = new TicketComment
    {
      TicketId = ticketId,
      UserId = user.Id,
      Comment = body,
      IsInternal = false,
      OrganizationId = org.Id
    };

    context.TicketComments.Add(comment);
    await context.SaveChangesAsync(ct);

    // Save reply attachments
    var ticket = await context.Tickets
        .FirstOrDefaultAsync(
            t => t.Id == ticketId, ct);
    if (ticket != null)
    {
      await SaveAttachmentsAsync(
          message, ticket,
          comment.Id, context, ct);
    }

    _logger.LogInformation(
        "Reply added to ticket {T}", ticketId);
  }

  // ── Helpers ───────────────────────────────────
  private async Task UpsertContactAsync(
      string email,
      string name,
      Guid orgId,
      Guid userId,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    try
    {
      var existing = await context.Contacts
          .IgnoreQueryFilters()
          .FirstOrDefaultAsync(c =>
              c.Email.ToLower() ==
                  email.ToLower() &&
              c.OrganizationId == orgId, ct);

      if (existing == null)
      {
        context.Contacts.Add(new Contact
        {
          FullName = name,
          Email = email,
          Source = "email",
          OrganizationId = orgId,
          LinkedUserId = userId
        });
        await context.SaveChangesAsync(ct);
      }
      else if (existing.FullName != name)
      {
        existing.FullName = name;
        await context.SaveChangesAsync(ct);
      }
    }
    catch (Exception ex)
    {
      // Don't fail ticket creation for contact issues
      _logger.LogWarning(
          "Contact upsert warning: {M}",
          ex.Message);
    }
  }

  private static string CleanSubject(
      string? raw, string fromName)
  {
    if (string.IsNullOrWhiteSpace(raw))
      return $"Email from {fromName}";

    var clean = System.Text.RegularExpressions
        .Regex.Replace(raw.Trim(),
            @"^(re:|fwd?:|fw:)\s*",
            "",
            System.Text.RegularExpressions
                .RegexOptions.IgnoreCase)
        .Trim();

    return string.IsNullOrEmpty(clean)
        ? $"Email from {fromName}"
        : clean;
  }

  private static string MakeTag(string name)
  {
    var tag = name.ToLowerInvariant()
        .Replace(" ", "-")
        .Replace(".", "")
        .Replace("@", "");

    return tag.Length > 15
        ? tag.Substring(0, 15)
        : tag;
  }

  private async Task NotifyAgentsAsync(
      string fromName,
      string subject,
      Ticket ticket,
      Guid orgId,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    var agents = await context.Users
        .IgnoreQueryFilters()
        .Where(u =>
            u.OrganizationId == orgId &&
            (u.Role == UserRole.Agent ||
             u.Role == UserRole.CompanyAdmin))
        .Select(u => new { u.Id })
        .ToListAsync(ct);

    foreach (var agent in agents)
    {
      context.Notifications.Add(
          new Notification
          {
            UserId = agent.Id,
            OrganizationId = orgId,
            Title = "New Email Ticket",
            Message =
                  $"Email from {fromName}: " +
                  $"{subject}",
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
    var parts = message.Attachments
        .OfType<MimePart>()
        .ToList();

    if (!parts.Any()) return;

    var wwwRoot = Path.Combine(
        Directory.GetCurrentDirectory(),
        "wwwroot");
    var uploadPath = Path.Combine(
        wwwRoot, "uploads");
    Directory.CreateDirectory(uploadPath);

    foreach (var part in parts)
    {
      if (ct.IsCancellationRequested) break;

      var fileName = part.FileName
          ?? $"attachment-{Guid.NewGuid()}";
      var ext = Path.GetExtension(fileName)
          .ToLowerInvariant();
      var safeFile = $"{Guid.NewGuid()}{ext}";
      var filePath = Path.Combine(
          uploadPath, safeFile);

      try
      {
        await using var stream =
            System.IO.File.Create(filePath);
        await part.Content.DecodeToAsync(
            stream, ct);

        var size =
            new FileInfo(filePath).Length;

        context.TicketAttachments.Add(
            new TicketAttachment
            {
              TicketId = ticket.Id,
              CommentId = commentId,
              FileName = fileName,
              FileUrl = $"/uploads/{safeFile}",
              ContentType =
                    part.ContentType.MimeType,
              FileSize = size,
              UploadedByUserId =
                    ticket.CreatedByUserId,
              OrganizationId =
                    ticket.OrganizationId
            });

        _logger.LogInformation(
            "Attachment: {F}", fileName);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex,
            "Attachment fail: {F}", fileName);
      }
    }

    await context.SaveChangesAsync(ct);
  }
}
