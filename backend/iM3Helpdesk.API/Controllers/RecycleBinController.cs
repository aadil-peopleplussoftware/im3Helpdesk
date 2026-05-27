using iM3Helpdesk.API.Services;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

/// <summary>
/// Admin-only Recycle Bin. Surfaces soft-deleted tickets, allows an admin
/// to either restore them (clear the deleted flag) or purge them
/// permanently. A background worker also purges entries older than the
/// org-configured retention window automatically.
/// </summary>
[ApiController]
[Route("api/recycle-bin")]
[Authorize(Roles = "CompanyAdmin,SuperAdmin")]
public class RecycleBinController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;
    private readonly INotificationService _notificationService;

    public RecycleBinController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService,
        INotificationService notificationService)
    {
        _context = context;
        _tenantService = tenantService;
        _notificationService = notificationService;
    }

    private Guid GetUserId()
    {
        var claim =
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        Guid.TryParse(claim, out var id);
        return id;
    }

    /// <summary>
    /// Lists every ticket currently in the recycle bin for the caller's
    /// organization, plus a "purgeAfter" timestamp computed from the
    /// org's configured retention window so the UI can show "will be
    /// permanently deleted on …".
    /// </summary>
    [HttpGet("tickets")]
    public async Task<IActionResult> ListDeletedTickets(
        [FromQuery] string? search = null)
    {
        var orgId = _tenantService.OrganizationId!.Value;

        var org = await _context.Organizations
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == orgId);
        if (org == null) return NotFound();

        var query = _context.Tickets
            .IgnoreQueryFilters()
            .Where(t => t.OrganizationId == orgId && t.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            query = query.Where(t =>
                t.Title.Contains(s) ||
                t.Category.Contains(s) ||
                (t.FromEmail != null && t.FromEmail.Contains(s)));
        }

        var rows = await query
            .OrderByDescending(t => t.DeletedAt)
            .Select(t => new
            {
                t.Id,
                t.TicketNumber,
                t.Title,
                t.Category,
                t.Status,
                t.Priority,
                t.FromEmail,
                t.FromName,
                t.CreatedAt,
                t.DeletedAt,
                t.DeletedByUserId,
                DeletedByName = _context.Users
                    .IgnoreQueryFilters()
                    .Where(u => u.Id == t.DeletedByUserId)
                    .Select(u => u.FullName)
                    .FirstOrDefault(),
                AssignedToName = _context.Users
                    .IgnoreQueryFilters()
                    .Where(u => u.Id == t.AssignedToUserId)
                    .Select(u => u.FullName)
                    .FirstOrDefault(),
            })
            .ToListAsync();

        // PurgeAfter is a derived value (depends on org retention settings),
        // so we compute it client-side rather than try to translate the
        // helper into SQL.
        var items = rows.Select(t => new
        {
            t.Id,
            t.TicketNumber,
            t.Title,
            t.Category,
            t.Status,
            t.Priority,
            t.FromEmail,
            t.FromName,
            t.CreatedAt,
            t.DeletedAt,
            t.DeletedByUserId,
            t.DeletedByName,
            t.AssignedToName,
            PurgeAfter = ComputePurgeAfter(
                t.DeletedAt,
                org.RecycleBinRetentionValue,
                org.RecycleBinRetentionUnit)
        });

        return Ok(new
        {
            retention = new
            {
                value = org.RecycleBinRetentionValue,
                unit = org.RecycleBinRetentionUnit
            },
            items
        });
    }

    /// <summary>Full details of a single deleted ticket, used by the open-popup view.</summary>
    [HttpGet("tickets/{id}")]
    public async Task<IActionResult> GetDeletedTicket(Guid id)
    {
        var orgId = _tenantService.OrganizationId!.Value;

        var ticket = await _context.Tickets
            .IgnoreQueryFilters()
            .Where(t => t.Id == id && t.OrganizationId == orgId && t.IsDeleted)
            .Select(t => new
            {
                t.Id,
                t.TicketNumber,
                t.Title,
                t.Description,
                t.Category,
                t.Status,
                t.Priority,
                t.Tags,
                t.FromEmail,
                t.FromName,
                t.CreatedAt,
                t.UpdatedAt,
                t.ResolvedAt,
                t.SlaDeadline,
                t.IsSlaBreached,
                t.SlaStatus,
                t.TimeSpentMinutes,
                t.TicketType,
                t.DeletedAt,
                t.DeletedByUserId,
                DeletedByName = _context.Users
                    .IgnoreQueryFilters()
                    .Where(u => u.Id == t.DeletedByUserId)
                    .Select(u => u.FullName)
                    .FirstOrDefault(),
                CreatedByName = _context.Users
                    .IgnoreQueryFilters()
                    .Where(u => u.Id == t.CreatedByUserId)
                    .Select(u => u.FullName)
                    .FirstOrDefault(),
                AssignedToName = _context.Users
                    .IgnoreQueryFilters()
                    .Where(u => u.Id == t.AssignedToUserId)
                    .Select(u => u.FullName)
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync();

        if (ticket == null) return NotFound();
        return Ok(ticket);
    }

    /// <summary>Restore a ticket from the recycle bin back to the active list.</summary>
    [HttpPost("tickets/{id}/restore")]
    public async Task<IActionResult> RestoreTicket(Guid id)
    {
        var orgId = _tenantService.OrganizationId!.Value;

        var ticket = await _context.Tickets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t =>
                t.Id == id &&
                t.OrganizationId == orgId &&
                t.IsDeleted);

        if (ticket == null) return NotFound();

        ticket.IsDeleted = false;
        ticket.DeletedAt = null;
        ticket.DeletedByUserId = null;
        ticket.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _notificationService.CreateActivityAsync(
            GetUserId(),
            orgId,
            "Restored",
            $"Ticket restored from recycle bin: {ticket.Title}",
            "Ticket", ticket.Id);

        return Ok(new { message = "Ticket restored" });
    }

    /// <summary>
    /// Permanently delete a ticket and all its comments. There is no
    /// undo after this — the row is removed from the database.
    /// </summary>
    [HttpDelete("tickets/{id}/purge")]
    public async Task<IActionResult> PurgeTicket(Guid id)
    {
        var orgId = _tenantService.OrganizationId!.Value;

        var ticket = await _context.Tickets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t =>
                t.Id == id &&
                t.OrganizationId == orgId &&
                t.IsDeleted);

        if (ticket == null) return NotFound();

        // Cascade-delete the conversation thread so we don't leave
        // orphan rows in TicketComments referencing a missing ticket.
        var comments = await _context.TicketComments
            .IgnoreQueryFilters()
            .Where(c => c.TicketId == id)
            .ToListAsync();
        if (comments.Count > 0)
            _context.TicketComments.RemoveRange(comments);

        _context.Tickets.Remove(ticket);
        await _context.SaveChangesAsync();

        await _notificationService.CreateActivityAsync(
            GetUserId(),
            orgId,
            "Purged",
            $"Ticket permanently deleted: {ticket.Title}",
            "Ticket", ticket.Id);

        return Ok(new { message = "Ticket permanently deleted" });
    }

    /// <summary>
    /// Computes the moment a soft-deleted ticket becomes eligible for
    /// automatic purge based on the org's configured retention.
    /// </summary>
    internal static DateTime? ComputePurgeAfter(
        DateTime? deletedAt,
        int value,
        string? unit)
    {
        if (deletedAt == null) return null;
        if (value <= 0) return null;

        var u = (unit ?? "days").Trim().ToLowerInvariant();
        return u switch
        {
            "year" or "years" => deletedAt.Value.AddYears(value),
            "month" or "months" => deletedAt.Value.AddMonths(value),
            _ => deletedAt.Value.AddDays(value)
        };
    }
}
