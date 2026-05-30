using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.Application.Contracts.Services;

public interface ISlaService
{
    DateTime CalculateSlaDeadline(TicketPriority priority, DateTime createdAt);
    string GetSlaStatus(DateTime? slaDeadline, TicketStatus status);
    Task CheckAndUpdateSlaAsync();
}
