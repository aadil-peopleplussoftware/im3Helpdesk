using iM3Helpdesk.API.Common.Helpers;
using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Application.DTOs.Tickets;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/Tickets")]
[Authorize]
public class TicketStatusController : TicketsControllerBase
{
    private readonly INotificationService _notificationService;
    private readonly IEmailService _emailService;
    private readonly ISlaService _slaService;
    private readonly ILogger<TicketStatusController> _logger;

    public TicketStatusController(
        ApplicationDbContext context,
        INotificationService notificationService,
        IEmailService emailService,
        ISlaService slaService,
        ILogger<TicketStatusController> logger)
        : base(context)
    {
        _notificationService = notificationService;
        _emailService = emailService;
        _slaService = slaService;
        _logger = logger;
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid id, [FromBody] UpdateStatusDto dto)
    {
        var ticket = await _context.Tickets
            .Include(t => t.CreatedBy)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null) return NotFound();
        var statusStr = dto.Status?.Trim() ?? "";
        if (!TicketEnumHelpers.TryParseTicketStatus(
            statusStr, out var newStatus))
            return BadRequest(new
            {
                message = $"Invalid status: {statusStr}"
            });

        if (!await IsMasterValueAllowedAsync(
            TicketEnumHelpers.TicketStatusField,
            newStatus.ToString()))
        {
            return BadRequest(new
            {
                message = $"Status {newStatus} is not active in ticket master"
            });
        }

        ticket.Status = newStatus;
        ticket.UpdatedAt = DateTime.UtcNow;

        if ((newStatus == TicketStatus.Resolved ||
             newStatus == TicketStatus.ResolvedOnBeta) &&
            !ticket.ResolvedAt.HasValue)
            ticket.ResolvedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var userId = GetUserId();
        if (userId != Guid.Empty)
        {
            await _notificationService.CreateActivityAsync(
                userId, ticket.OrganizationId,
                "StatusChanged",
                $"Status → {newStatus}: {ticket.Title}",
                "Ticket", ticket.Id);
        }

        if (ticket.CreatedBy?.Email != null)
        {
            try
            {
                var html = $@"
        <div style='font-family:Arial;max-width:600px'>
          <p>Your ticket <strong>{ticket.Title}</strong>
          (#TN{ticket.TicketNumber}) status has been 
          updated to <strong>{newStatus}</strong>.</p>
        </div>";
                await _emailService.SendAsync(
                    ticket.CreatedBy.Email,
                    $"Ticket #{ticket.TicketNumber} Status: {newStatus}",
                    html,
                    organizationId: ticket.OrganizationId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Status email failed");
            }
        }
        return Ok(new { message = "Status updated" });
    }

    [HttpPut("{id}/priority")]
    public async Task<IActionResult> UpdatePriority(
        Guid id, [FromBody] UpdatePriorityDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        if (!TicketEnumHelpers.TryParseTicketPriority(
            dto.Priority, out var newP))
            return BadRequest();

        if (!await IsMasterValueAllowedAsync(
            TicketEnumHelpers.TicketPriorityField,
            newP.ToString()))
        {
            return BadRequest(new
            {
                message = $"Priority {newP} is not active in ticket master"
            });
        }

        ticket.Priority = newP;
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.SlaDeadline = _slaService
            .CalculateSlaDeadline(
                ticket.Priority, ticket.CreatedAt);
        ticket.SlaStatus = _slaService
            .GetSlaStatus(
                ticket.SlaDeadline, ticket.Status);

        await _context.SaveChangesAsync();
        return Ok(new { message = "Priority updated" });
    }

    [HttpPut("{id}/type")]
    public async Task<IActionResult> UpdateType(
        Guid id, [FromBody] UpdateTypeDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        var normalizedTicketType = dto.TicketType.Trim();
        if (!await IsMasterValueAllowedAsync(
            TicketEnumHelpers.TicketTypeField,
            normalizedTicketType))
        {
            return BadRequest(new
            {
                message = $"Ticket Type {normalizedTicketType} is not active in ticket master"
            });
        }

        ticket.TicketType = normalizedTicketType;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { message = "Type updated" });
    }

    [HttpPut("{id}/tags")]
    public async Task<IActionResult> UpdateTags(
        Guid id, [FromBody] UpdateTagsDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        ticket.Tags = string.Join(",",
            dto.Tags
                .Select(t => t.Trim().ToLower())
                .Where(t => !string.IsNullOrEmpty(t))
                .Distinct());
        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Tags updated",
            tags = ticket.Tags
        });
    }

    [HttpPut("{id}/log-time")]
    public async Task<IActionResult> LogTime(
        Guid id, [FromBody] LogTimeDto dto)
    {
        var ticket = await _context.Tickets
            .FindAsync(id);
        if (ticket == null) return NotFound();

        ticket.TimeSpentMinutes += dto.Minutes;
        ticket.LastActivityAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var userId = GetUserId();
        if (userId != Guid.Empty)
        {
            await _notificationService.CreateActivityAsync(
                userId, ticket.OrganizationId,
                "TimeLogged",
                $"Logged {dto.Minutes} min: {ticket.Title}",
                "Ticket", ticket.Id);
        }

        return Ok(new
        {
            message = "Time logged",
            totalMinutes = ticket.TimeSpentMinutes,
            totalHours = Math.Round(
                ticket.TimeSpentMinutes / 60.0, 1)
        });
    }
}
