using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Application.DTOs.Tickets;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/Tickets")]
[Authorize]
public class TicketCommentsController : TicketsControllerBase
{
    private readonly ICurrentTenantService _tenantService;
    private readonly INotificationService _notificationService;
    private readonly IEmailService _emailService;
    private readonly ILogger<TicketCommentsController> _logger;

    public TicketCommentsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService,
        INotificationService notificationService,
        IEmailService emailService,
        ILogger<TicketCommentsController> logger)
        : base(context)
    {
        _tenantService = tenantService;
        _notificationService = notificationService;
        _emailService = emailService;
        _logger = logger;
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

        return Ok(new
        {
            commentId = comment.Id,
            message = "Comment added"
        });
    }
}
