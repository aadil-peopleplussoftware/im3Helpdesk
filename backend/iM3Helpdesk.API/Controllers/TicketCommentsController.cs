using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Application.DTOs.Tickets;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/Tickets")]
[Authorize]
public class TicketCommentsController : TicketsControllerBase
{
    private readonly ICurrentTenantService _tenantService;
    private readonly INotificationService _notificationService;
    private readonly IEmailService _emailService;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<TicketCommentsController> _logger;

    public TicketCommentsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService,
        INotificationService notificationService,
        IEmailService emailService,
        IWebHostEnvironment env,
        ILogger<TicketCommentsController> logger)
        : base(context)
    {
        _tenantService = tenantService;
        _notificationService = notificationService;
        _emailService = emailService;
        _env = env;
        _logger = logger;
    }

    [HttpPut("{id}/comments/{commentId}")]
    public async Task<IActionResult> UpdateComment(
        Guid id,
        Guid commentId,
        [FromBody] UpdateCommentDto dto)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value
            ?? User.FindFirst("role")?.Value;
        var isAgent = roleClaim is "Agent" or "CompanyAdmin" or "SuperAdmin";
        if (!isAgent) return Forbid();

        var comment = await _context.TicketComments
            .Include(c => c.Ticket)
            .FirstOrDefaultAsync(c => c.Id == commentId && c.TicketId == id);

        if (comment == null) return NotFound();
        if (!comment.IsInternal || comment.Source == "system")
            return BadRequest(new { message = "Only private notes can be edited" });

        if (DateTime.UtcNow - comment.CreatedAt > TimeSpan.FromHours(1))
            return BadRequest(new { message = "Note can only be edited within 1 hour" });

        var trimmed = (dto.Comment ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return BadRequest(new { message = "Comment is required" });

        var html = trimmed
            .Replace("\r\n", "\n")
            .Replace("\r", "\n")
            .Replace("\n", "<br>");

        comment.Comment = html;
        comment.IsInternal = true;

        if (comment.Ticket != null)
        {
            comment.Ticket.UpdatedAt = DateTime.UtcNow;
            comment.Ticket.LastActivityAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        if (comment.Ticket != null)
        {
            await _notificationService.CreateActivityAsync(
                userId,
                comment.Ticket.OrganizationId,
                "NoteUpdated",
                "Updated a private note",
                "Ticket",
                comment.Ticket.Id);

            await NotifyWatchersAndAssigneeAsync(
                comment.Ticket,
                userId,
                "Ticket note updated",
                $"A private note was updated on #TN{comment.Ticket.TicketNumber}: {comment.Ticket.Title}");
        }

        return Ok(new { message = "Comment updated" });
    }

    [HttpDelete("{id}/comments/{commentId}")]
    public async Task<IActionResult> DeleteComment(
        Guid id,
        Guid commentId)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value
            ?? User.FindFirst("role")?.Value;
        var isAgent = roleClaim is "Agent" or "CompanyAdmin" or "SuperAdmin";
        if (!isAgent) return Forbid();

        var comment = await _context.TicketComments
            .Include(c => c.Ticket)
            .FirstOrDefaultAsync(c => c.Id == commentId && c.TicketId == id);

        if (comment == null) return NotFound();
        if (!comment.IsInternal || comment.Source == "system")
            return BadRequest(new { message = "Only private notes can be deleted" });

        if (DateTime.UtcNow - comment.CreatedAt > TimeSpan.FromHours(1))
            return BadRequest(new { message = "Note can only be deleted within 1 hour" });

        var attachments = await _context.TicketAttachments
            .Where(a => a.CommentId == commentId)
            .ToListAsync();

        foreach (var attachment in attachments)
        {
            var filePath = Path.Combine(
                _env.WebRootPath ?? "wwwroot",
                attachment.FileUrl.TrimStart('/'));

            if (System.IO.File.Exists(filePath))
                System.IO.File.Delete(filePath);
        }

        if (attachments.Count > 0)
            _context.TicketAttachments.RemoveRange(attachments);

        _context.TicketComments.Remove(comment);

        if (comment.Ticket != null)
        {
            comment.Ticket.UpdatedAt = DateTime.UtcNow;
            comment.Ticket.LastActivityAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        if (comment.Ticket != null)
        {
            await _notificationService.CreateActivityAsync(
                userId,
                comment.Ticket.OrganizationId,
                "NoteDeleted",
                "Deleted a private note",
                "Ticket",
                comment.Ticket.Id);

            await NotifyWatchersAndAssigneeAsync(
                comment.Ticket,
                userId,
                "Ticket note deleted",
                $"A private note was deleted on #TN{comment.Ticket.TicketNumber}: {comment.Ticket.Title}");
        }

        return Ok(new { message = "Comment deleted" });
    }

    [HttpPost("{id}/comments")]
    public async Task<IActionResult> AddComment(
        Guid id,
        [FromBody] AddCommentDto dto)
    {
        var ticket = await _context.Tickets
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null) return NotFound();

        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var agent = await _context.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId);

        // ── Threading: anchor on Ticket.InboundMessageId, then chain through comments ──
        var commentMsgIds = await _context.TicketComments
            .Where(c => c.TicketId == id &&
                        !string.IsNullOrEmpty(c.EmailMessageId))
            .OrderBy(c => c.CreatedAt)
            .Select(c => c.EmailMessageId!)
            .ToListAsync();

        var referenceChain = new List<string>();
        if (!string.IsNullOrWhiteSpace(ticket.InboundMessageId))
            referenceChain.Add(ticket.InboundMessageId);
        referenceChain.AddRange(commentMsgIds);

        // In-Reply-To = most recent message in the chain
        var lastMsgId = referenceChain.LastOrDefault();

        // ── Resolve notified users (notes AND replies) ──
        string? notifiedTo = null;
        var notifyMailList = new List<string>();
        var notifyUserIds = new List<Guid>();
        if (dto.NotifyUserIds is { Count: > 0 })
        {
            var users = await _context.Users
                .Where(u => dto.NotifyUserIds.Contains(u.Id))
                .Select(u => new { u.Id, u.Email })
                .ToListAsync();
            notifyMailList.AddRange(users.Select(u => u.Email));
            notifyUserIds.AddRange(users.Select(u => u.Id));
        }
        if (dto.NotifyEmails is { Count: > 0 })
            notifyMailList.AddRange(dto.NotifyEmails);
        notifyMailList = notifyMailList
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (notifyMailList.Count > 0)
            notifiedTo = string.Join(",", notifyMailList);

        var ccList = (dto.Cc ?? new List<string>())
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim()).ToList();
        var bccList = (dto.Bcc ?? new List<string>())
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim()).ToList();

        var comment = new TicketComment
        {
            TicketId = id,
            UserId = userId,
            Comment = dto.Comment,
            IsInternal = dto.IsInternal,
            Source = "web",
            OrganizationId =
                _tenantService.OrganizationId!.Value,
            Cc = ccList.Count > 0 ? string.Join(",", ccList) : null,
            Bcc = bccList.Count > 0 ? string.Join(",", bccList) : null,
            NotifiedTo = notifiedTo,
            InReplyTo = !dto.IsInternal ? lastMsgId : null,
            References = !dto.IsInternal && referenceChain.Count > 0
                ? string.Join(" ", referenceChain) : null
        };

        _context.TicketComments.Add(comment);

        // Update ticket activity time
        ticket.LastActivityAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        // ✅ Send email if public reply
        if (!dto.IsInternal)
        {
            var replyTo = !string.IsNullOrWhiteSpace(ticket.FromEmail)
                ? ticket.FromEmail.Trim()
                : ticket.CreatedBy?.Email;
            if (!string.IsNullOrWhiteSpace(replyTo))
            {
                try
                {
                    var outboundMsgId = await _emailService.SendReplyAsync(
                        replyTo,
                        ticket.Title,
                        dto.Comment,
                        $"#TN{ticket.TicketNumber}",
                        agent?.FullName ?? "Support",
                        agent?.Signature ?? "",
                        ticket.OrganizationId,
                        cc: ccList,
                        bcc: bccList,
                        inReplyTo: lastMsgId,
                        references: referenceChain);

                    if (!string.IsNullOrEmpty(outboundMsgId))
                    {
                        comment.EmailMessageId = outboundMsgId;
                        await _context.SaveChangesAsync();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Reply email failed");
                }
            }
        }

        // ✅ Notify mentioned agents for private notes
        if (dto.IsInternal && notifyMailList.Count > 0)
        {
            foreach (var em in notifyMailList)
            {
                try
                {
                    await _emailService.SendAsync(
                        em,
                        $"🔒 Note on #TN{ticket.TicketNumber}: {ticket.Title}",
                        $"<p><strong>{agent?.FullName ?? "Agent"}</strong> added a private note:</p>" +
                        $"<blockquote style='border-left:3px solid #f59e0b;padding:8px 12px;background:#fff7ed'>{dto.Comment}</blockquote>",
                        organizationId: ticket.OrganizationId,
                        ticketNumberTag: $"#TN{ticket.TicketNumber}");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Note notify email failed for {Email}", em);
                }
            }
        }

        // ✅ In-app notification for every mentioned user (note or reply)
        if (notifyUserIds.Count > 0)
        {
            var actorName = agent?.FullName ?? "An agent";
            var kindLabel = dto.IsInternal ? "private note" : "reply";
            foreach (var uid in notifyUserIds.Distinct())
            {
                if (uid == userId) continue; // don't notify self
                try
                {
                    await _notificationService.CreateAsync(
                        uid,
                        ticket.OrganizationId,
                        "You were mentioned",
                        $"{actorName} mentioned you in a {kindLabel} on #TN{ticket.TicketNumber}: {ticket.Title}",
                        "info", ticket.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Mention notification failed for {UserId}", uid);
                }
            }
        }

        await _notificationService.CreateActivityAsync(
            userId,
            _tenantService.OrganizationId!.Value,
            dto.IsInternal ? "NoteAdded" : "Commented",
            dto.IsInternal
                ? "Added a private note"
                : "Replied to customer",
            "Ticket", id);

        await NotifyWatchersAndAssigneeAsync(
            ticket,
            userId,
            dto.IsInternal ? "New private note" : "New ticket reply",
            dto.IsInternal
                ? $"A private note was added on #TN{ticket.TicketNumber}: {ticket.Title}"
                : $"A reply was added on #TN{ticket.TicketNumber}: {ticket.Title}");

        return Ok(new
        {
            commentId = comment.Id,
            message = "Comment added"
        });
    }

    private async Task NotifyWatchersAndAssigneeAsync(
        Ticket ticket,
        Guid actorUserId,
        string title,
        string message)
    {
        var recipients = new HashSet<Guid>();
        if (ticket.AssignedToUserId.HasValue)
            recipients.Add(ticket.AssignedToUserId.Value);

        var watcherIds = await _context.TicketWatchers
            .Where(w => w.TicketId == ticket.Id)
            .Select(w => w.UserId)
            .ToListAsync();

        foreach (var watcherId in watcherIds)
            recipients.Add(watcherId);

        recipients.Remove(actorUserId);
        if (recipients.Count == 0) return;

        foreach (var recipientId in recipients)
        {
            try
            {
                await _notificationService.CreateAsync(
                    recipientId,
                    ticket.OrganizationId,
                    title,
                    message,
                    "info",
                    ticket.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Watcher notification failed for {UserId}", recipientId);
            }
        }

        var emailRecipients = await _context.Users
            .IgnoreQueryFilters()
            .Where(u => recipients.Contains(u.Id) && !string.IsNullOrWhiteSpace(u.Email))
            .Select(u => new { u.Email })
            .ToListAsync();

        foreach (var recipient in emailRecipients)
        {
            try
            {
                await _emailService.SendAsync(
                    recipient.Email!,
                    title,
                    $"<p>{System.Net.WebUtility.HtmlEncode(message)}</p>",
                    organizationId: ticket.OrganizationId,
                    ticketNumberTag: $"#TN{ticket.TicketNumber}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Watcher email failed for {Email}", recipient.Email);
            }
        }
    }
}
