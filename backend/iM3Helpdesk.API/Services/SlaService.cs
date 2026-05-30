using iM3Helpdesk.Application.Contracts.Services;
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
