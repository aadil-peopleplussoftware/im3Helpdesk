using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Services;

public class SlaService : ISlaService
{
  private readonly ApplicationDbContext _context;

  public SlaService(ApplicationDbContext context)
  {
    _context = context;
  }

  public DateTime CalculateSlaDeadline(
      TicketPriority priority, DateTime createdAt)
  {
    return priority switch
    {
      TicketPriority.Critical => createdAt.AddHours(4),
      TicketPriority.High => createdAt.AddHours(8),
      TicketPriority.Medium => createdAt.AddHours(24),
      TicketPriority.Low => createdAt.AddHours(72),
      _ => createdAt.AddHours(24)
    };
  }

  public async Task<DateTime> CalculateSlaDeadlineAsync(
      Guid organizationId,
      TicketPriority priority,
      DateTime createdAt)
      => await CalculateSlaDeadlineAsync(organizationId, priority, createdAt, null);

  /// <summary>
  /// Resolution-time deadline. When the matching <see cref="SlaTarget"/>
  /// has <c>OperationalHours == "BusinessHours"</c>, the result skips
  /// non-working days, after-hours, and holidays for the matching profile
  /// (resolved via <paramref name="agentGroupId"/>, falling back to org Default).
  /// </summary>
  public async Task<DateTime> CalculateSlaDeadlineAsync(
      Guid organizationId,
      TicketPriority priority,
      DateTime createdAt,
      Guid? agentGroupId)
  {
    var target = await _context.SlaTargets
        .IgnoreQueryFilters()
        .Where(t => t.OrganizationId == organizationId
                 && t.Priority == priority
                 && t.Policy!.IsActive
                 && t.Policy!.IsDefault)
        .Select(t => new { t.ResolutionMinutes, t.OperationalHours })
        .FirstOrDefaultAsync();

    if (target == null || target.ResolutionMinutes <= 0)
      return CalculateSlaDeadline(priority, createdAt);

    if (!string.Equals(target.OperationalHours, "BusinessHours", StringComparison.OrdinalIgnoreCase))
      return createdAt.AddMinutes(target.ResolutionMinutes);

    var bh = await ResolveBusinessHoursAsync(organizationId, agentGroupId);
    if (bh == null || string.Equals(bh.Mode, "TwentyFourSeven", StringComparison.OrdinalIgnoreCase))
      return createdAt.AddMinutes(target.ResolutionMinutes);

    return AddWorkingMinutes(createdAt, target.ResolutionMinutes, bh);
  }

  private async Task<BusinessHours?> ResolveBusinessHoursAsync(Guid orgId, Guid? agentGroupId)
  {
    if (agentGroupId.HasValue)
    {
      var groupBh = await _context.AgentGroups
          .IgnoreQueryFilters()
          .Where(g => g.Id == agentGroupId.Value && g.BusinessHoursId != null)
          .Select(g => g.BusinessHoursId)
          .FirstOrDefaultAsync();
      if (groupBh.HasValue)
      {
        var resolved = await _context.BusinessHours
            .IgnoreQueryFilters()
            .Include(b => b.Holidays)
            .FirstOrDefaultAsync(b => b.Id == groupBh.Value);
        if (resolved != null) return resolved;
      }
    }

    return await _context.BusinessHours
        .IgnoreQueryFilters()
        .Include(b => b.Holidays)
        .Where(b => b.OrganizationId == orgId && b.IsDefault)
        .FirstOrDefaultAsync();
  }

  /// <summary>
  /// Walks day-by-day from <paramref name="start"/> consuming working
  /// minutes within the BH profile's open windows, skipping closed days
  /// and matching holidays (year-agnostic when recurring).
  /// </summary>
  private static DateTime AddWorkingMinutes(DateTime start, int minutes, BusinessHours bh)
  {
    var open = ParseTime(bh.StartTime);
    var close = ParseTime(bh.EndTime);
    if (close <= open) return start.AddMinutes(minutes); // misconfigured — fall back

    var remaining = minutes;
    var cursor = start;

    // Cap iterations so a misconfigured profile (no open days) can't loop forever.
    for (var i = 0; i < 366 * 2 && remaining > 0; i++)
    {
      var dayStart = cursor.Date.Add(open);
      var dayEnd = cursor.Date.Add(close);

      if (!IsWorkingDay(cursor, bh) || IsHoliday(cursor, bh))
      {
        cursor = cursor.Date.AddDays(1).Add(open);
        continue;
      }

      if (cursor < dayStart) cursor = dayStart;
      if (cursor >= dayEnd)
      {
        cursor = cursor.Date.AddDays(1).Add(open);
        continue;
      }

      var availableMins = (int)Math.Floor((dayEnd - cursor).TotalMinutes);
      if (remaining <= availableMins)
        return cursor.AddMinutes(remaining);

      remaining -= availableMins;
      cursor = cursor.Date.AddDays(1).Add(open);
    }

    return cursor;
  }

  private static TimeSpan ParseTime(string hhmm)
  {
    if (TimeSpan.TryParse(hhmm, out var ts)) return ts;
    return TimeSpan.FromHours(9);
  }

  private static bool IsWorkingDay(DateTime d, BusinessHours bh) => d.DayOfWeek switch
  {
    DayOfWeek.Monday    => bh.Monday,
    DayOfWeek.Tuesday   => bh.Tuesday,
    DayOfWeek.Wednesday => bh.Wednesday,
    DayOfWeek.Thursday  => bh.Thursday,
    DayOfWeek.Friday    => bh.Friday,
    DayOfWeek.Saturday  => bh.Saturday,
    DayOfWeek.Sunday    => bh.Sunday,
    _ => false,
  };

  private static bool IsHoliday(DateTime d, BusinessHours bh)
  {
    var date = DateOnly.FromDateTime(d);
    foreach (var h in bh.Holidays)
    {
      if (h.IsRecurring)
      {
        if (h.Date.Month == date.Month && h.Date.Day == date.Day) return true;
      }
      else if (h.Date == date) return true;
    }
    return false;
  }

  public string GetSlaStatus(DateTime? slaDeadline, TicketStatus status)
  {
    if (status == TicketStatus.Resolved ||
        status == TicketStatus.ResolvedOnBeta ||
        status == TicketStatus.Closed)
      return "Completed";

    if (!slaDeadline.HasValue) return "No SLA";

    var hoursLeft = (slaDeadline.Value - DateTime.UtcNow).TotalHours;

    if (hoursLeft < 0) return "Breached";
    if (hoursLeft < 2) return "Critical";
    if (hoursLeft < 4) return "Warning";
    return "OnTrack";
  }

  public async Task CheckAndUpdateSlaAsync()
  {
    var tickets = await _context.Tickets
        .IgnoreQueryFilters()
        .Where(t => t.Status == TicketStatus.Open
            || t.Status == TicketStatus.InProgress)
        .ToListAsync();

    foreach (var ticket in tickets)
    {
      if (ticket.SlaDeadline.HasValue
          && DateTime.UtcNow > ticket.SlaDeadline.Value)
      {
        ticket.IsSlaBreached = true;
        ticket.SlaStatus = "Breached";
      }
      else if (ticket.SlaDeadline.HasValue)
      {
        ticket.SlaStatus = GetSlaStatus(
            ticket.SlaDeadline, ticket.Status);
      }
    }

    await _context.SaveChangesAsync();
  }
}
