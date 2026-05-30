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
public class TicketAssignmentsController : TicketsControllerBase
{
    private readonly ICurrentTenantService _tenantService;
    private readonly INotificationService _notificationService;
    private readonly IEmailService _emailService;
    private readonly ILogger<TicketAssignmentsController> _logger;

    public TicketAssignmentsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService,
        INotificationService notificationService,
        IEmailService emailService,
        ILogger<TicketAssignmentsController> logger)
        : base(context)
    {
        _tenantService = tenantService;
        _notificationService = notificationService;
        _emailService = emailService;
        _logger = logger;
    }

    [HttpPut("{id}/assign")]
    public async Task<IActionResult> AssignTicket(
        Guid id, [FromBody] AssignTicketDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        ticket.AssignedToUserId = dto.AgentId;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var userId = GetUserId();
        if (userId != Guid.Empty)
        {
            await _notificationService.CreateActivityAsync(
                userId, ticket.OrganizationId,
                "Assigned",
                $"Ticket assigned: {ticket.Title}",
                "Ticket", ticket.Id);

            if (dto.AgentId.HasValue)
            {
                await _notificationService.CreateAsync(
                    dto.AgentId.Value,
                    ticket.OrganizationId,
                    "Ticket Assigned",
                    $"You have been assigned: {ticket.Title}",
                    "info", ticket.Id);

                // Send email to agent
                var agent = await _context.Users
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(u =>
                        u.Id == dto.AgentId.Value);

                if (agent?.Email != null)
                {
                    try
                    {
                        var html = $@"
<div style='font-family:Arial;max-width:600px'>
  <p>Hi {agent.FullName},</p>
  <p>Ticket <strong>{ticket.Title}</strong>
  (#TN{ticket.TicketNumber}) has been assigned to you.
  </p>
</div>";
                        await _emailService.SendAsync(
                            agent.Email,
                            $"Ticket Assigned: #{ticket.TicketNumber}",
                            html,
                            organizationId: ticket.OrganizationId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex,
                            "Assign email failed");
                    }
                }
            }
        }

        return Ok(new
        {
            message = "Ticket assigned successfully"
        });
    }

    [HttpPut("{id}/group")]
    public async Task<IActionResult> UpdateGroup(
        Guid id, [FromBody] UpdateGroupDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        ticket.AgentGroupId =
            dto.AgentGroupId == Guid.Empty
                ? null : dto.AgentGroupId;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var userId = GetUserId();
        if (userId != Guid.Empty)
        {
            await _notificationService.CreateActivityAsync(
                userId,
                _tenantService.OrganizationId!.Value,
                "GroupChanged",
                $"Group updated: {ticket.Title}",
                "Ticket", ticket.Id);
        }

        return Ok(new { message = "Group updated" });
    }

    [HttpPost("{id}/forward")]
    public async Task<IActionResult> ForwardTicket(
        Guid id,
        [FromBody] ForwardTicketDto dto)
    {
        var ticket = await _context.Tickets
            .FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound();

        if (string.IsNullOrEmpty(dto.ToEmail))
            return BadRequest(new
            {
                message = "Email is required"
            });

        try
        {
            // Identify the forwarding agent for both the From header
            // (display name) and a visible attribution line in the body.
            var agentId = GetUserId();
            var agent = await _context.Users
                .Where(u => u.Id == agentId)
                .Select(u => new { u.FullName, u.Email })
                .FirstOrDefaultAsync();
            var agentName = agent?.FullName ?? "Support";

            var html = $@"
<div style='font-family:Arial;max-width:600px'>
  <p style='color:#374151;font-size:13px;margin:0 0 12px'>
    Forwarded by <strong>{System.Net.WebUtility.HtmlEncode(agentName)}</strong>
  </p>
  <p>A support ticket has been forwarded to you:</p>
  <h3>{ticket.Title}</h3>
  <p><strong>Ticket ID:</strong>
    #TN{ticket.TicketNumber}</p>
  <hr/>
  <div>{dto.Message ?? ticket.Description}</div>
</div>";

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
            var lastMsgId = referenceChain.LastOrDefault();

            var outboundMsgId = await _emailService.SendForwardAsync(
                dto.ToEmail,
                $"[Forwarded] {ticket.Title}" +
                $" #TN{ticket.TicketNumber}",
                html,
                organizationId: ticket.OrganizationId,
                cc: dto.Cc,
                bcc: dto.Bcc,
                inReplyTo: lastMsgId,
                references: referenceChain,
                fromDisplayName: agentName);

            // ── Persist forward as a visible conversation entry ──
            var ccCsv = (dto.Cc != null && dto.Cc.Count > 0)
                ? string.Join(",", dto.Cc
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(e => e.Trim()))
                : null;
            var bccCsv = (dto.Bcc != null && dto.Bcc.Count > 0)
                ? string.Join(",", dto.Bcc
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(e => e.Trim()))
                : null;

            var forwardComment = new TicketComment
            {
                TicketId = id,
                UserId = agentId,
                Comment = dto.Message ?? ticket.Description ?? string.Empty,
                IsInternal = false,
                Source = "forward",
                OrganizationId = ticket.OrganizationId,
                NotifiedTo = dto.ToEmail,
                Cc = string.IsNullOrEmpty(ccCsv) ? null : ccCsv,
                Bcc = string.IsNullOrEmpty(bccCsv) ? null : bccCsv,
                EmailMessageId = outboundMsgId,
                InReplyTo = lastMsgId,
                References = referenceChain.Count > 0
                    ? string.Join(" ", referenceChain) : null
            };
            _context.TicketComments.Add(forwardComment);

            ticket.LastActivityAt = DateTime.UtcNow;
            ticket.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Forwarded successfully",
                commentId = forwardComment.Id
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Forward failed");
            return StatusCode(500, new
            {
                message = "Forward failed"
            });
        }
    }
}
