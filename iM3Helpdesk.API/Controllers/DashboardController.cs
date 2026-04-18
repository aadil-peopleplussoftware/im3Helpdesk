using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;
  private readonly IMemoryCache _cache;

  public DashboardController(
      ApplicationDbContext context,
      ICurrentTenantService tenant,
      IMemoryCache cache)
  {
    _context = context;
    _tenant = tenant;
    _cache = cache;
  }

  [HttpGet("stats")]
  public async Task<IActionResult> GetStats()
  {
    var orgId = _tenant.OrganizationId;
    var cacheKey = $"dashboard_stats_{orgId}";

    if (_cache.TryGetValue(cacheKey, out var cached))
      return Ok(cached);

    // ✅ FIX: Sequential queries — EF Core DbContext is NOT thread-safe.
    //         Task.WhenAll on the same context causes the
    //         "second operation started" exception.

    var tickets = await _context.Tickets
        .AsNoTracking()
        .Select(t => new
        {
          t.Status,
          t.Priority,
          t.CreatedAt,
          t.ResolvedAt
        })
        .ToListAsync();

    var agentCount = await _context.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.OrganizationId == orgId &&
                    (u.Role == UserRole.Agent ||
                     u.Role == UserRole.CompanyAdmin))
        .CountAsync();

    var org = await _context.Organizations
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == orgId);

    var recent = await _context.Tickets
        .AsNoTracking()
        .OrderByDescending(t => t.CreatedAt)
        .Take(5)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.TicketNumber,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          t.CreatedAt
        })
        .ToListAsync();

    var today = DateTime.UtcNow.Date;
    var weekAgo = DateTime.UtcNow.AddDays(-7);

    var result = new
    {
      totalTickets = tickets.Count,
      openTickets = tickets.Count(t => t.Status == TicketStatus.Open),
      inProgressTickets = tickets.Count(t => t.Status == TicketStatus.InProgress),
      resolvedTickets = tickets.Count(t => t.Status == TicketStatus.Resolved),
      closedTickets = tickets.Count(t => t.Status == TicketStatus.Closed),
      totalAgents = agentCount,
      newTicketsToday = tickets.Count(t => t.CreatedAt.Date == today),
      newTicketsThisWeek = tickets.Count(t => t.CreatedAt >= weekAgo),
      avgResolutionHours = tickets
            .Where(t => t.ResolvedAt.HasValue)
            .Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours)
            .DefaultIfEmpty(0)
            .Average()
            .ToString("F1"),
      lowPriority = tickets.Count(t => t.Priority == TicketPriority.Low),
      mediumPriority = tickets.Count(t => t.Priority == TicketPriority.Medium),
      highPriority = tickets.Count(t => t.Priority == TicketPriority.High),
      criticalPriority = tickets.Count(t => t.Priority == TicketPriority.Critical),
      trialDaysLeft = org != null
            ? Math.Max(0, (int)(org.TrialEndsAt - DateTime.UtcNow).TotalDays)
            : 30,
      organizationName = org?.Name ?? "",
      recentTickets = recent
    };

    _cache.Set(cacheKey, result, TimeSpan.FromSeconds(30));
    return Ok(result);
  }

  [HttpGet("widgets")]
  public async Task<IActionResult> GetWidgets()
  {
    var orgId = _tenant.OrganizationId;
    var cacheKey = $"dashboard_widgets_{orgId}";

    if (_cache.TryGetValue(cacheKey, out var cached))
      return Ok(cached);

    var weekAgo = DateTime.UtcNow.AddDays(-7);

    // Sequential — same reason as above
    var trend = await _context.Tickets
        .AsNoTracking()
        .Where(t => t.CreatedAt >= weekAgo)
        .GroupBy(t => t.CreatedAt.Date)
        .Select(g => new { date = g.Key, count = g.Count() })
        .OrderBy(x => x.date)
        .ToListAsync();

    var byStatus = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Status)
        .Select(g => new { status = g.Key.ToString(), count = g.Count() })
        .ToListAsync();

    var byPriority = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Priority)
        .Select(g => new { priority = g.Key.ToString(), count = g.Count() })
        .ToListAsync();

    var result = new { trend, byStatus, byPriority };

    _cache.Set(cacheKey, result, TimeSpan.FromSeconds(60));
    return Ok(result);
  }
}
