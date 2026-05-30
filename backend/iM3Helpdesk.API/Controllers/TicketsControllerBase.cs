using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

/// <summary>
/// Shared base for the split Tickets controllers (issue #9).
/// Holds the common DbContext access and tenant-aware helpers
/// that don't fit cleanly in a static helper class.
/// </summary>
public abstract class TicketsControllerBase : ControllerBase
{
    protected readonly ApplicationDbContext _context;

    protected TicketsControllerBase(ApplicationDbContext context)
    {
        _context = context;
    }

    protected Guid GetUserId()
    {
        var claim =
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        Guid.TryParse(claim, out var id);
        return id;
    }

    protected async Task<bool> IsMasterValueAllowedAsync(
        string field,
        string value)
    {
        var hasRows = await _context.TicketFieldMasters
            .AnyAsync(x => x.Field == field);

        if (!hasRows)
            return true;

        return await _context.TicketFieldMasters
            .AnyAsync(x =>
                x.Field == field &&
                x.IsActive &&
                x.Value == value);
    }
}
