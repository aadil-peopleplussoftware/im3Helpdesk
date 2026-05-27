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
        "âœ‰ Email Polling started at {T}", _serviceStartTime);

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
        // Poll every 30 seconds for near-real-time ticket creation / replies.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
      }
      catch (OperationCanceledException) { break; }
    }

    _logger.LogInformation("âœ‰ Email Polling stopped");
  }

  private async Task PollAllOrgsAsync(CancellationToken ct)
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();

    var orgs = await context.Organizations
        .IgnoreQueryFilters()
        .Where(o =>
            o.IsActive &&
            o.EmailPollingEnabled &&
            !string.IsNullOrEmpty(o.SupportEmail) &&
            !string.IsNullOrEmpty(o.SmtpUsername) &&
            !string.IsNullOrEmpty(o.SmtpPassword) &&
            !string.IsNullOrEmpty(o.ImapHost))
        .ToListAsync(ct);

    if (!orgs.Any())
    {
      _logger.LogInformation("No org mailboxes configured for polling");
      return;
    }

    _logger.LogInformation(
        "Polling {N} configured org mailbox(es)", orgs.Count);

    foreach (var org in orgs)
    {
      if (ct.IsCancellationRequested) break;
      await PollOrgMailboxAsync(org, context, ct);
    }
  }

  private async Task PollOrgMailboxAsync(
      Organization org,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    using var client = new ImapClient();
    var username = org.SmtpUsername ?? org.SmtpFromEmail ?? org.SupportEmail ?? "";
    var password = org.SmtpPassword ?? "";
    var imapPort = org.ImapPort ?? 993;

    try
    {
      await client.ConnectAsync(org.ImapHost, imapPort, true, ct);
      await client.AuthenticateAsync(username, password, ct);

      var inbox = client.Inbox;
      await inbox.OpenAsync(FolderAccess.ReadWrite, ct);

      var since = _serviceStartTime.AddMinutes(-1);
      var query = SearchQuery.And(
          SearchQuery.NotSeen,
          SearchQuery.DeliveredAfter(since));

      var uids = await inbox.SearchAsync(query, ct);
      _logger.LogInformation(
          "Org {Org}: {Count} unread email(s)", org.Name, uids.Count);

      foreach (var uid in uids)
      {
        if (ct.IsCancellationRequested) break;

        try
        {
          var msg = await inbox.GetMessageAsync(uid, ct);

          if (msg.Date.UtcDateTime < _serviceStartTime.AddMinutes(-5))
          {
            _logger.LogDebug(
                "Skipping old email dated {D}", msg.Date);
            continue;
          }

          if (!IsAddressedToOrg(msg, org))
          {
            _logger.LogDebug(
                "Skipping email not addressed to support mailbox: {To}", msg.To);
            continue;
          }

          await ProcessEmailAsync(msg, org, context, ct);
          await inbox.AddFlagsAsync(uid, MessageFlags.Seen, true, ct);

          _logger.LogInformation(
              "Processed support email for org: {Org}", org.Name);
        }
        catch (Exception ex)
        {
          _logger.LogError(ex, "Error processing uid {Uid} for {Org}",
              uid, org.Name);
        }
      }

      await client.DisconnectAsync(true, ct);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "IMAP failed for org {Org}: {Message}",
          org.Name, ex.Message);
      try
      {
        if (client.IsConnected)
          await client.DisconnectAsync(false, ct);
      }
      catch { }
    }
  }

  private static bool IsAddressedToOrg(MimeMessage message, Organization org)
  {
    var expected = new[]
    {
      org.SupportEmail,
      org.SmtpFromEmail,
      org.SmtpUsername
    }
      .Where(e => !string.IsNullOrWhiteSpace(e))
      .Select(e => e!.Trim().ToLowerInvariant())
      .ToHashSet();

    if (expected.Count == 0) return false;

    var addressed = message.To.Mailboxes
        .Concat(message.Cc.Mailboxes)
        .Concat(message.Bcc.Mailboxes)
        .Select(m => m.Address?.Trim().ToLowerInvariant() ?? "")
        .Where(a => !string.IsNullOrWhiteSpace(a));

    return addressed.Any(a => expected.Contains(a));
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
      _logger.LogWarning("No sender found â€” skipping");
      return;
    }

    var fromEmail = (fromBox.Address ?? "").Trim();
    if (string.IsNullOrEmpty(fromEmail)) return;

    var fromName = string.IsNullOrEmpty(fromBox.Name)
        ? fromEmail.Split('@')[0]
        : fromBox.Name.Trim();

    var ownEmails = new[]
    {
      org.SupportEmail,
      org.SmtpFromEmail,
      org.SmtpUsername,
      _config["SmtpSettings:FromEmail"]
    }.Where(e => !string.IsNullOrWhiteSpace(e));

    if (ownEmails.Any(e => fromEmail.Equals(e,
        StringComparison.OrdinalIgnoreCase)))
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
        "Processing email from {E} â€” Subject: {S}", fromEmail, message.Subject);

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
    // âŒ DISABLED: User auto-creation from email is turned off.
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

    // ── Capture inbound Cc recipients (exclude own org addresses + sender) ──
    var inboundCc = ExtractExternalCc(message, fromEmail, org);

    var ticket = new Ticket
    {
      Title = subject,
      Description = description,
      FromEmail = fromEmail,
      FromName = fromName,
      CcEmails = inboundCc.Count > 0 ? string.Join(",", inboundCc) : null,
      InboundMessageId = NormalizeMsgId(message.MessageId ?? string.Empty),
      Category = "General",
      Priority = TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = "Support",
      OrganizationId = org.Id,
      // ✅ Email-originated ticket: no registered user → CreatedByUserId is null.
      //    Sender identity is preserved in FromEmail + FromName.
      CreatedByUserId = null,
      Tags = $"email,support-email,{nameTag}",
      SlaDeadline = DateTime.UtcNow.AddHours(24),
      SlaStatus = "OnTrack",
      TicketNumber = lastNum + 1
    };

    context.Tickets.Add(ticket);
    await context.SaveChangesAsync(ct);

    _logger.LogInformation(
        "âœ… Ticket #TN{N} created for org [{O}]: {S}",
        ticket.TicketNumber, org.Name, subject);
    await SaveAttachmentsAsync(message, ticket, null, context, ct);
    await NotifyAgentsAsync(fromName, subject, ticket, org.Id, context, ct);
  }

  /// <summary>
  /// Locate an existing ticket for an inbound message using RFC-5322 threading
  /// headers first, then fallback heuristics. Does NOT require the sender
  /// to have a User record — email-originated tickets never have one.
  ///
  /// Resolution order:
  ///   1. In-Reply-To matches Ticket.InboundMessageId or a TicketComment.EmailMessageId
  ///   2. Any Message-Id from References matches the same
  ///   3. Subject contains explicit #TN&lt;number&gt; tag
  ///   4. Sender email matches Ticket.FromEmail on a recent (30 days) non-closed ticket
  ///   5. Registered user (UI-submitted tickets) on a recent non-closed ticket
  /// </summary>
  private async Task<Guid?> FindExistingTicketAsync(
      MimeMessage message,
      Guid orgId,
      string fromEmail,
      ApplicationDbContext context,
      CancellationToken ct)
  {
    // ── 1 / 2. RFC-5322 In-Reply-To + References headers ──
    var candidateIds = new List<string>();
    if (!string.IsNullOrWhiteSpace(message.InReplyTo))
      candidateIds.Add(NormalizeMsgId(message.InReplyTo));
    foreach (var r in message.References ?? Enumerable.Empty<string>())
      candidateIds.Add(NormalizeMsgId(r));

    candidateIds = candidateIds
        .Where(s => !string.IsNullOrWhiteSpace(s))
        .Distinct()
        .ToList();

    _logger.LogInformation(
        "[Email-In] From={From} Subj=\"{Subj}\" InReplyTo={IRT} RefCount={RC} CandidateIds=[{Ids}]",
        fromEmail, message.Subject, message.InReplyTo ?? "(none)",
        message.References?.Count ?? 0, string.Join(",", candidateIds));

    // ── 0. Custom X-iM3-Ticket header (most reliable — set by all outbound paths) ──
    var anchorHeader = message.Headers["X-iM3-Ticket"];
    if (!string.IsNullOrWhiteSpace(anchorHeader))
    {
      var m = TicketNumberRegex.Match(anchorHeader);
      if (m.Success && int.TryParse(m.Groups[1].Value, out var anchorTn))
      {
        var byAnchor = await context.Tickets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t =>
                t.OrganizationId == orgId &&
                t.TicketNumber == anchorTn, ct);
        if (byAnchor != null) return byAnchor.Id;
      }
    }

    if (candidateIds.Count > 0)
    {
      // (a) Match against Ticket.InboundMessageId
      var ticketAnchor = await context.Tickets
          .IgnoreQueryFilters()
          .Where(t => t.OrganizationId == orgId &&
                      t.InboundMessageId != null &&
                      candidateIds.Contains(t.InboundMessageId))
          .Select(t => (Guid?)t.Id)
          .FirstOrDefaultAsync(ct);
      if (ticketAnchor.HasValue) return ticketAnchor;

      // (b) Match against any TicketComment.EmailMessageId
      var commentAnchor = await context.TicketComments
          .IgnoreQueryFilters()
          .Where(c => c.OrganizationId == orgId &&
                      c.EmailMessageId != null &&
                      candidateIds.Contains(c.EmailMessageId))
          .OrderByDescending(c => c.CreatedAt)
          .Select(c => (Guid?)c.TicketId)
          .FirstOrDefaultAsync(ct);
      if (commentAnchor.HasValue) return commentAnchor;
    }

    // ── 3. Explicit #TN<number> in subject ──
    var tnMatch = TicketNumberRegex.Match(message.Subject ?? "");
    if (tnMatch.Success && int.TryParse(tnMatch.Groups[1].Value, out var tnNum))
    {
      var byNumber = await context.Tickets
          .IgnoreQueryFilters()
          .FirstOrDefaultAsync(t =>
              t.OrganizationId == orgId &&
              t.TicketNumber == tnNum, ct);

      if (byNumber != null) return byNumber.Id;
    }

    // ── 4 / 5. Subject "Re:" heuristic + sender fallback ──
    bool subjectLooksLikeReply =
        (message.Subject ?? "").TrimStart()
            .StartsWith("re:", StringComparison.OrdinalIgnoreCase) ||
        !string.IsNullOrWhiteSpace(message.InReplyTo) ||
        (message.References?.Count ?? 0) > 0;

    if (!subjectLooksLikeReply) return null;

    var since = DateTime.UtcNow.AddDays(-30);
    var loweredFrom = fromEmail.ToLower();

    // 4. Ticket.FromEmail (email-originated tickets, no User row)
    var byFromEmail = await context.Tickets
        .IgnoreQueryFilters()
        .Where(t =>
            t.OrganizationId == orgId &&
            t.FromEmail != null &&
            t.FromEmail.ToLower() == loweredFrom &&
            t.Status != TicketStatus.Closed &&
            t.CreatedAt >= since)
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => (Guid?)t.Id)
        .FirstOrDefaultAsync(ct);
    if (byFromEmail.HasValue) return byFromEmail;

    // 5. Registered user (UI-submitted tickets)
    var customer = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == loweredFrom &&
            u.OrganizationId == orgId, ct);
    if (customer == null) return null;

    var byUser = await context.Tickets
        .IgnoreQueryFilters()
        .Where(t =>
            t.CreatedByUserId == customer.Id &&
            t.OrganizationId == orgId &&
            t.Status != TicketStatus.Closed &&
            t.CreatedAt >= since)
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => (Guid?)t.Id)
        .FirstOrDefaultAsync(ct);
    return byUser;
  }

  /// <summary>Strip enclosing angle brackets from a Message-Id header value.</summary>
  private static string NormalizeMsgId(string raw)
  {
    if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
    var s = raw.Trim();
    if (s.StartsWith("<") && s.EndsWith(">") && s.Length >= 2)
      s = s.Substring(1, s.Length - 2);
    return s.Trim();
  }

  /// <summary>
  /// Extract external Cc addresses from an inbound message, excluding our own
  /// org's support / SMTP addresses and the original sender. Returned in arrival
  /// order, lowercased &amp; deduplicated.
  /// </summary>
  private List<string> ExtractExternalCc(
      MimeMessage message,
      string fromEmail,
      Organization org)
  {
    var ownEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    void AddOwn(string? e)
    {
      if (!string.IsNullOrWhiteSpace(e)) ownEmails.Add(e.Trim());
    }
    AddOwn(org.SupportEmail);
    AddOwn(org.SmtpFromEmail);
    AddOwn(org.SmtpUsername);
    AddOwn(_config["SmtpSettings:FromEmail"]);
    AddOwn(fromEmail);

    var result = new List<string>();
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var box in message.Cc.Mailboxes)
    {
      var addr = (box.Address ?? string.Empty).Trim();
      if (string.IsNullOrEmpty(addr)) continue;
      if (ownEmails.Contains(addr)) continue;
      if (!seen.Add(addr)) continue;
      result.Add(addr);
    }
    return result;
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
    // Dedup: same inbound Message-Id already processed?
    var inboundMsgId = NormalizeMsgId(message.MessageId ?? string.Empty);
    if (!string.IsNullOrWhiteSpace(inboundMsgId))
    {
      var already = await context.TicketComments
          .IgnoreQueryFilters()
          .AnyAsync(c =>
              c.TicketId == ticketId &&
              c.EmailMessageId == inboundMsgId, ct);
      if (already)
      {
        _logger.LogInformation(
            "Skipping duplicate inbound reply (msg-id already stored): {M}",
            inboundMsgId);
        return;
      }
    }

    // Optional link to a registered user if one happens to exist
    var user = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == fromEmail.ToLower() &&
            u.OrganizationId == org.Id, ct);

    var inReplyTo = NormalizeMsgId(message.InReplyTo ?? string.Empty);
    var references = message.References != null
        ? string.Join(" ", message.References
            .Select(NormalizeMsgId)
            .Where(s => !string.IsNullOrWhiteSpace(s)))
        : null;

    // ── Capture this reply's Cc and merge into ticket-level CcEmails ──
    var replyCc = ExtractExternalCc(message, fromEmail, org);

    var comment = new TicketComment
    {
      TicketId = ticketId,
      UserId = user?.Id,                          // null when customer has no account
      FromEmail = user == null ? fromEmail : null,
      FromName = user == null ? fromName : null,
      Comment = BuildDescription(message),
      IsInternal = false,
      OrganizationId = org.Id,
      EmailMessageId = inboundMsgId,
      Source = "email",
      Cc = replyCc.Count > 0 ? string.Join(",", replyCc) : null,
      InReplyTo = string.IsNullOrWhiteSpace(inReplyTo) ? null : inReplyTo,
      References = string.IsNullOrWhiteSpace(references) ? null : references
    };

    context.TicketComments.Add(comment);

    // Bump ticket activity; auto-reopen if it was closed.
    var ticket = await context.Tickets
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(t => t.Id == ticketId, ct);
    if (ticket != null)
    {
      ticket.LastActivityAt = DateTime.UtcNow;
      ticket.UpdatedAt = DateTime.UtcNow;
      if (ticket.Status == TicketStatus.Closed)
        ticket.Status = TicketStatus.Open;

      // Merge any new external Cc recipients onto the ticket
      // so future agent replies include them by default.
      if (replyCc.Count > 0)
      {
        var existing = (ticket.CcEmails ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(e => e.Trim())
            .Where(e => e.Length > 0)
            .ToList();
        var merged = existing
            .Concat(replyCc)
            .Where(e => !string.IsNullOrWhiteSpace(e) &&
                        !e.Equals(ticket.FromEmail ?? string.Empty,
                            StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        ticket.CcEmails = merged.Count > 0 ? string.Join(",", merged) : null;
      }
    }

    await context.SaveChangesAsync(ct);

    if (ticket != null)
      await SaveAttachmentsAsync(message, ticket, comment.Id, context, ct);

    _logger.LogInformation(
        "💬 Reply added to ticket {T} from {E} (user: {U})",
        ticketId, fromEmail, user?.Id.ToString() ?? "none");
  }

  private static string BuildDescription(MimeMessage message)
  {
    string raw;
    if (!string.IsNullOrEmpty(message.HtmlBody))
      raw = message.HtmlBody;
    else if (!string.IsNullOrEmpty(message.TextBody))
    {
      var encoded = System.Net.WebUtility.HtmlEncode(message.TextBody)
          .Replace("\r\n\r\n", "</p><p>")
          .Replace("\n\n", "</p><p>")
          .Replace("\r\n", "<br>")
          .Replace("\n", "<br>");
      raw = $"<p>{encoded}</p>";
    }
    else
      return "<p>(No content)</p>";

    return StripQuotedReply(raw);
  }

  // Regex set for quoted-reply trimming (Freshdesk-style)
  private static readonly Regex GmailQuoteRegex = new(
      @"<blockquote[^>]*class=[""']gmail_quote[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex GmailExtraRegex = new(
      @"<div[^>]*class=[""']gmail_quote[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OutlookAppendRegex = new(
      @"<div[^>]*id=[""']appendonsend[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OutlookDividerRegex = new(
      @"<div[^>]*id=[""']divRplyFwdMsg[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OnWroteRegex = new(
      @"(<(?:div|p|blockquote)[^>]*>\s*)?On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2})[\s\S]{0,500}?wrote:\s*<?[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex GenericBlockquoteRegex = new(
      @"<blockquote[\s\S]*?</blockquote>",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex TrailingEmptyRegex = new(
      @"(?:<br\s*/?>|\s|&nbsp;|<p>\s*</p>|<div>\s*</div>)+$",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);

  /// <summary>Strip the "On &lt;date&gt; ... wrote:" quoted block so only the new
  /// reply text is stored (Freshdesk behaviour).</summary>
  private static string StripQuotedReply(string html)
  {
    if (string.IsNullOrWhiteSpace(html)) return html;
    html = GmailQuoteRegex.Replace(html, string.Empty);
    html = GmailExtraRegex.Replace(html, string.Empty);
    html = OutlookAppendRegex.Replace(html, string.Empty);
    html = OutlookDividerRegex.Replace(html, string.Empty);
    html = OnWroteRegex.Replace(html, string.Empty);
    html = GenericBlockquoteRegex.Replace(html, string.Empty);
    html = TrailingEmptyRegex.Replace(html, string.Empty);
    return html.Trim();
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
        if (part.Content == null)
        {
          _logger.LogWarning("Attachment {F} has no content", fileName);
          continue;
        }

        await using var stream = File.Create(filePath);
        await part.Content.DecodeToAsync(stream, ct);

        var size = new FileInfo(filePath).Length;

        if (size > MaxAttachmentBytes)
        {
          _logger.LogWarning(
              "Attachment {F} too large ({S} bytes) â€” skipped",
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