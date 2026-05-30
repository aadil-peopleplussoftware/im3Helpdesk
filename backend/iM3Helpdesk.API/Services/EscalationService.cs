using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Services;

public class EscalationService : IEscalationService
{
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly ILogger<EscalationService> _logger;

  public EscalationService(
      IServiceScopeFactory scopeFactory,
      ILogger<EscalationService> logger)
  {
    _scopeFactory = scopeFactory;
    _logger = logger;
  }

  public async Task CheckAndEscalateAsync()
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();
    var notifService = scope.ServiceProvider
        .GetRequiredService<INotificationService>();

    var breachedTickets = await context.Tickets
        .IgnoreQueryFilters()
        .Include(t => t.CreatedBy)
        .Where(t =>
            (t.Status == TicketStatus.Open ||
             t.Status == TicketStatus.InProgress) &&
            t.SlaDeadline.HasValue &&
            t.SlaDeadline < DateTime.UtcNow &&
            !t.IsSlaBreached)
        .ToListAsync();

    foreach (var ticket in breachedTickets)
    {
      ticket.IsSlaBreached = true;
      ticket.SlaStatus = "Breached";

      if (ticket.CreatedBy != null && ticket.CreatedByUserId.HasValue)
      {
        await notifService.CreateAsync(
            ticket.CreatedByUserId.Value,
            ticket.OrganizationId,
            "SLA Breached",
            $"Ticket '{ticket.Title}' SLA has been breached!",
            "error",
            ticket.Id);
      }

      var admins = await context.Users
          .IgnoreQueryFilters()
          .Where(u => u.OrganizationId == ticket.OrganizationId
              && u.Role == Domain.Enums.UserRole.CompanyAdmin)
          .ToListAsync();

      foreach (var admin in admins)
      {
        await notifService.CreateAsync(
            admin.Id,
            ticket.OrganizationId,
            "Ticket Escalated",
            $"Ticket '{ticket.Title}' needs immediate attention!",
            "error",
            ticket.Id);
      }

      _logger.LogWarning(
          "Ticket {Id} SLA breached: {Title}",
          ticket.Id, ticket.Title);
    }

    if (breachedTickets.Any())
      await context.SaveChangesAsync();
  }
}
