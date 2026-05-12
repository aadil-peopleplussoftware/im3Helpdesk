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

  // ── GET /api/Dashboard/stats ──────────────────────────
  [HttpGet("stats")]
  public async Task<IActionResult> GetStats()
  {
    var orgId = _tenant.OrganizationId;
    var cacheKey = $"stats_{orgId}";

    if (_cache.TryGetValue(cacheKey, out var hit))
      return Ok(hit);

    var today = DateTime.UtcNow.Date;
    var weekAgo = DateTime.UtcNow.AddDays(-7);

    // ── 1. Status counts — aggregated IN DATABASE ──────
    // No more loading all tickets into memory
    var statusCounts = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Status)
        .Select(g => new { Status = g.Key, Count = g.Count() })
        .ToListAsync();

    // ── 2. Priority counts — aggregated IN DATABASE ────
    var priorityCounts = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Priority)
        .Select(g => new { Priority = g.Key, Count = g.Count() })
        .ToListAsync();

    // ── 3. Date-based counts — aggregated IN DATABASE ──
    var dateCounts = await _context.Tickets
        .AsNoTracking()
        .GroupBy(_ => 1)  // single group for multiple aggregates
        .Select(g => new
        {
          Total = g.Count(),
          NewToday = g.Count(t => t.CreatedAt >= today),
          NewThisWeek = g.Count(t => t.CreatedAt >= weekAgo),
        })
        .FirstOrDefaultAsync();

    // ── 4. Avg resolution — only resolved tickets ──────
    var avgResHours = await _context.Tickets
        .AsNoTracking()
        .Where(t => t.ResolvedAt.HasValue)
        .Select(t => EF.Functions.DateDiffHour(
            t.CreatedAt, t.ResolvedAt!.Value))
        .AverageAsync(h => (double?)h) ?? 0;

    // ── 5. Agent count ────────────────────────────────
    var agentCount = await _context.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .CountAsync(u =>
            u.OrganizationId == orgId &&
            (u.Role == UserRole.Agent ||
             u.Role == UserRole.CompanyAdmin));

    // ── 6. Organization name ──────────────────────────
    var orgName = await _context.Organizations
        .AsNoTracking()
        .Where(o => o.Id == orgId)
        .Select(o => o.Name)
        .FirstOrDefaultAsync() ?? "";

    // ── 7. Recent 5 tickets ───────────────────────────
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

    // ── Build result from DB aggregates ───────────────
    int GetStatus(TicketStatus s) =>
        statusCounts.FirstOrDefault(x => x.Status == s)?.Count ?? 0;

    int GetPriority(TicketPriority p) =>
        priorityCounts.FirstOrDefault(x => x.Priority == p)?.Count ?? 0;

    var result = new
    {
      totalTickets = dateCounts?.Total ?? 0,
      openTickets = GetStatus(TicketStatus.Open),
      inProgressTickets = GetStatus(TicketStatus.InProgress),
      resolvedTickets = GetStatus(TicketStatus.Resolved),
      closedTickets = GetStatus(TicketStatus.Closed),
      totalAgents = agentCount,
      newTicketsToday = dateCounts?.NewToday ?? 0,
      newTicketsThisWeek = dateCounts?.NewThisWeek ?? 0,
      avgResolutionHours = Math.Round(avgResHours, 1),
      lowPriority = GetPriority(TicketPriority.Low),
      mediumPriority = GetPriority(TicketPriority.Medium),
      highPriority = GetPriority(TicketPriority.High),
      criticalPriority = GetPriority(TicketPriority.Critical),
      organizationName = orgName,
      recentTickets = recent,
      trialDaysLeft = 30   // TODO: calculate from org.TrialEndsAt
    };

    _cache.Set(cacheKey, result, TimeSpan.FromSeconds(30));
    return Ok(result);
  }

  // ── GET /api/Dashboard/widgets ────────────────────────
  [HttpGet("widgets")]
  public async Task<IActionResult> GetWidgets()
  {
    var cacheKey = $"widgets_{_tenant.OrganizationId}";

    if (_cache.TryGetValue(cacheKey, out var hit))
      return Ok(hit);

    var weekAgo = DateTime.UtcNow.AddDays(-7);

    // All queries run IN DATABASE — no in-memory aggregation
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
        .Select(g => new
        {
          status = g.Key.ToString(),
          count = g.Count()
        })
        .ToListAsync();

    var byPriority = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Priority)
        .Select(g => new
        {
          priority = g.Key.ToString(),
          count = g.Count()
        })
        .ToListAsync();

    var byCategory = await _context.Tickets
        .AsNoTracking()
        .GroupBy(t => t.Category)
        .Select(g => new
        {
          category = g.Key,
          count = g.Count()
        })
        .ToListAsync();

    var result = new { trend, byStatus, byPriority, byCategory };

    _cache.Set(cacheKey, result, TimeSpan.FromSeconds(60));
    return Ok(result);
  }
}
