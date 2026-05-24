using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/analytics/heatmap")]
[Authorize]
public class AnalyticsHeatmapController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public AnalyticsHeatmapController(ApplicationDbContext context)
  {
    _context = context;
  }

  private static DateTime NormalizeStart(DateTime? startDate)
    => (startDate ?? DateTime.UtcNow.AddDays(-7)).Date;

  private static DateTime NormalizeEndExclusive(DateTime? endDate)
    => ((endDate ?? DateTime.UtcNow).Date).AddDays(1);

  private static bool TryParsePriority(string? priority, out TicketPriority parsed)
  {
    parsed = TicketPriority.Medium;
    if (string.IsNullOrWhiteSpace(priority)) return false;

    var p = priority.Trim();
    if (p.Equals("All", StringComparison.OrdinalIgnoreCase)) return false;
    if (p.Equals("Urgent", StringComparison.OrdinalIgnoreCase)) p = nameof(TicketPriority.Critical);

    return Enum.TryParse(p, ignoreCase: true, out parsed);
  }

  private static string NormalizeType(string? type)
  {
    if (string.IsNullOrWhiteSpace(type)) return "";
    var t = type.Trim();
    if (t.Equals("All", StringComparison.OrdinalIgnoreCase)) return "";
    return t;
  }

  private IQueryable<Domain.Entities.Ticket> ApplyFilters(
    IQueryable<Domain.Entities.Ticket> query,
    DateTime start,
    DateTime endExclusive,
    string? priority,
    Guid? agentId,
    string? type)
  {
    query = query.Where(t => t.CreatedAt >= start && t.CreatedAt < endExclusive);

    if (TryParsePriority(priority, out var prio))
      query = query.Where(t => t.Priority == prio);

    if (agentId.HasValue && agentId.Value != Guid.Empty)
      query = query.Where(t => t.AssignedToUserId == agentId.Value);

    var normalizedType = NormalizeType(type);
    if (!string.IsNullOrEmpty(normalizedType))
    {
      if (normalizedType.Equals("Email", StringComparison.OrdinalIgnoreCase))
      {
        query = query.Where(t =>
          EF.Functions.Like(t.Tags ?? string.Empty, "%email%") ||
          _context.TicketComments.Any(c => c.TicketId == t.Id && c.Source == "email"));
      }
      else if (normalizedType.Equals("Chat", StringComparison.OrdinalIgnoreCase))
      {
        query = query.Where(t =>
          (t.TicketType != null && t.TicketType == "Chat") ||
          _context.TicketComments.Any(c => c.TicketId == t.Id && c.Source == "chat"));
      }
      else if (normalizedType.Equals("Manual", StringComparison.OrdinalIgnoreCase))
      {
        query = query.Where(t =>
          !(EF.Functions.Like(t.Tags ?? string.Empty, "%email%") ||
            _context.TicketComments.Any(c => c.TicketId == t.Id && c.Source == "email")) &&
          !((t.TicketType != null && t.TicketType == "Chat") ||
            _context.TicketComments.Any(c => c.TicketId == t.Id && c.Source == "chat")));
      }
      else
      {
        query = query.Where(t => t.TicketType != null && t.TicketType == normalizedType);
      }
    }

    return query;
  }

  private static int ToMondayFirst1To7(DayOfWeek dayOfWeek)
  {
    // .NET: Sunday=0..Saturday=6
    // Convert to Monday=1..Sunday=7
    return (((int)dayOfWeek + 6) % 7) + 1;
  }

  private static string DayNameFromMondayFirst1To7(int day)
  {
    return day switch
    {
      1 => "Monday",
      2 => "Tuesday",
      3 => "Wednesday",
      4 => "Thursday",
      5 => "Friday",
      6 => "Saturday",
      7 => "Sunday",
      _ => ""
    };
  }

  private static string FormatHourLabel(int hour)
  {
    var dt = new DateTime(2000, 1, 1, hour, 0, 0, DateTimeKind.Utc);
    return dt.ToString("h tt");
  }

  // 1) Hour x Day heatmap data
  // GET /api/analytics/heatmap/hourly?startDate=...&endDate=...&priority=...&agentId=...&type=...
  [HttpGet("hourly")]
  public async Task<IActionResult> GetHourly(
    [FromQuery] DateTime? startDate,
    [FromQuery] DateTime? endDate,
    [FromQuery] string? priority,
    [FromQuery] Guid? agentId,
    [FromQuery] string? type)
  {
    var start = NormalizeStart(startDate);
    var endExclusive = NormalizeEndExclusive(endDate);

    var baseQuery = ApplyFilters(
      _context.Tickets.AsNoTracking(),
      start,
      endExclusive,
      priority,
      agentId,
      type);

    // Group in DB by DATE + HOUR (safe translation); compute DayOfWeek in-memory.
    // This keeps DB work small (<= days-in-range * 24 rows) and avoids provider issues with DayOfWeek translation.
    var grouped = await baseQuery
      .GroupBy(t => new
      {
        Day = t.CreatedAt.Date,
        Hour = t.CreatedAt.Hour
      })
      .Select(g => new
      {
        date = g.Key.Day,
        hour = g.Key.Hour,
        count = g.Count()
      })
      .ToListAsync();

    var data = grouped
      .Select(x => new
      {
        dayOfWeek = ToMondayFirst1To7(x.date.DayOfWeek),
        hour = x.hour,
        count = x.count
      })
      .OrderBy(x => x.dayOfWeek)
      .ThenBy(x => x.hour)
      .ToList();

    var total = data.Sum(x => x.count);
    var daysInRange = Math.Max(1, (int)(endExclusive.Date - start.Date).TotalDays);
    var avgPerDay = Math.Round(total / (double)daysInRange, 1);

    var peakDay = data
      .GroupBy(x => x.dayOfWeek)
      .Select(g => new { dayOfWeek = g.Key, total = g.Sum(x => x.count) })
      .OrderByDescending(x => x.total)
      .FirstOrDefault();

    var peakHour = data
      .GroupBy(x => x.hour)
      .Select(g => new { hour = g.Key, total = g.Sum(x => x.count) })
      .OrderByDescending(x => x.total)
      .FirstOrDefault();

    return Ok(new
    {
      data,
      peakDay = peakDay == null ? "" : DayNameFromMondayFirst1To7(peakDay.dayOfWeek),
      peakHour = peakHour == null ? "" : FormatHourLabel(peakHour.hour),
      avgPerDay
    });
  }

  // 2) Daily bar heatmap
  // GET /api/analytics/heatmap/daily?startDate=...&endDate=...&priority=...&agentId=...&type=...
  [HttpGet("daily")]
  public async Task<IActionResult> GetDaily(
    [FromQuery] DateTime? startDate,
    [FromQuery] DateTime? endDate,
    [FromQuery] string? priority,
    [FromQuery] Guid? agentId,
    [FromQuery] string? type)
  {
    var start = NormalizeStart(startDate);
    var endExclusive = NormalizeEndExclusive(endDate);

    var baseQuery = ApplyFilters(
      _context.Tickets.AsNoTracking(),
      start,
      endExclusive,
      priority,
      agentId,
      type);

    var grouped = await baseQuery
      .GroupBy(t => t.CreatedAt.Date)
      .Select(g => new
      {
        date = g.Key,
        count = g.Count()
      })
      .OrderBy(x => x.date)
      .ToListAsync();

    // Fill missing dates with 0 counts so the UI can render a continuous 7-day strip.
    var lookup = grouped.ToDictionary(x => x.date, x => x.count);
    var days = (int)(endExclusive.Date - start.Date).TotalDays;
    if (days <= 0) days = 1;

    var data = Enumerable
      .Range(0, days)
      .Select(i => start.AddDays(i))
      .Select(d => new
      {
        date = d.ToString("yyyy-MM-dd"),
        count = lookup.TryGetValue(d.Date, out var c) ? c : 0,
        dayName = d.ToString("dddd")
      })
      .ToList();

    return Ok(new { data });
  }

  // 3) Monthly calendar heatmap
  // GET /api/analytics/heatmap/monthly?month=5&year=2026&priority=...&agentId=...&type=...
  [HttpGet("monthly")]
  public async Task<IActionResult> GetMonthly(
    [FromQuery] int month,
    [FromQuery] int year,
    [FromQuery] string? priority,
    [FromQuery] Guid? agentId,
    [FromQuery] string? type)
  {
    if (month is < 1 or > 12) return BadRequest(new { message = "Invalid month" });
    if (year is < 2000 or > 2100) return BadRequest(new { message = "Invalid year" });

    var start = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
    var endExclusive = start.AddMonths(1);

    var baseQuery = ApplyFilters(
      _context.Tickets.AsNoTracking(),
      start,
      endExclusive,
      priority,
      agentId,
      type);

    var grouped = await baseQuery
      .GroupBy(t => t.CreatedAt.Date)
      .Select(g => new
      {
        date = g.Key,
        count = g.Count()
      })
      .OrderBy(x => x.date)
      .ToListAsync();

    var maxCount = grouped.Count == 0 ? 0 : grouped.Max(x => x.count);
    var totalMonth = grouped.Sum(x => x.count);

    var data = grouped
      .Select(x => new
      {
        date = x.date.ToString("yyyy-MM-dd"),
        count = x.count
      })
      .ToList();

    return Ok(new
    {
      data,
      maxCount,
      totalMonth
    });
  }
}
