using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public DashboardController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet("stats")]
  public async Task<IActionResult> GetStats()
  {
    // ✅ Single query with groupBy
    var tickets = await _context.Tickets
        .AsNoTracking()
        .Select(t => new
        {
          t.Status,
          t.Priority,
          t.CreatedAt,
          t.ResolvedAt,
          t.TimeSpentMinutes
        })
        .ToListAsync();

    var users = await _context.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.OrganizationId ==
            _tenantService.OrganizationId)
        .Select(u => new { u.Role })
        .ToListAsync();

    var org = await _context.Organizations
        .AsNoTracking()
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    var today = DateTime.UtcNow.Date;
    var weekAgo = DateTime.UtcNow.AddDays(-7);

    var avgRes = tickets
        .Where(t => t.ResolvedAt.HasValue)
        .Select(t => (t.ResolvedAt!.Value - t.CreatedAt)
            .TotalHours)
        .DefaultIfEmpty(0)
        .Average();

    var recentTickets = await _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .OrderByDescending(t => t.CreatedAt)
        .Take(5)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.TicketNumber,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          t.CreatedAt,
          CreatedBy = t.CreatedBy!.FullName
        })
        .ToListAsync();

    return Ok(new
    {
      totalTickets = tickets.Count,
      openTickets = tickets.Count(t =>
          t.Status == TicketStatus.Open),
      inProgressTickets = tickets.Count(t =>
          t.Status == TicketStatus.InProgress),
      resolvedTickets = tickets.Count(t =>
          t.Status == TicketStatus.Resolved),
      closedTickets = tickets.Count(t =>
          t.Status == TicketStatus.Closed),
      totalAgents = users.Count(u =>
          u.Role == UserRole.Agent),
      totalAdmins = users.Count(u =>
          u.Role == UserRole.CompanyAdmin),
      newTicketsToday = tickets.Count(t =>
          t.CreatedAt.Date == today),
      newTicketsThisWeek = tickets.Count(t =>
          t.CreatedAt >= weekAgo),
      avgResolutionHours = Math.Round(avgRes, 1),
      lowPriority = tickets.Count(t =>
          t.Priority == TicketPriority.Low),
      mediumPriority = tickets.Count(t =>
          t.Priority == TicketPriority.Medium),
      highPriority = tickets.Count(t =>
          t.Priority == TicketPriority.High),
      criticalPriority = tickets.Count(t =>
          t.Priority == TicketPriority.Critical),
      trialDaysLeft = org != null
            ? Math.Max(0, (int)(org.TrialEndsAt -
                DateTime.UtcNow).TotalDays)
            : 30,
      organizationName = org?.Name ?? "",
      recentTickets
    });
  }

  [HttpGet("widgets")]
  public async Task<IActionResult> GetWidgetData()
  {
    var tickets = await _context.Tickets.ToListAsync();
    var today = DateTime.UtcNow.Date;
    var last7Days = Enumerable.Range(0, 7)
        .Select(i => today.AddDays(-i))
        .Reverse()
        .ToList();

    var ticketsByDay = last7Days.Select(day => new
    {
      date = day.ToString("dd MMM"),
      count = tickets.Count(t => t.CreatedAt.Date == day)
    }).ToList();

    var resolvedByDay = last7Days.Select(day => new
    {
      date = day.ToString("dd MMM"),
      count = tickets.Count(t =>
          t.ResolvedAt.HasValue &&
          t.ResolvedAt.Value.Date == day)
    }).ToList();

    return Ok(new { ticketsByDay, resolvedByDay });
  }

}
