using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.Application.Contracts.Services;

public interface ISlaService
{
    /// <summary>
    /// Synchronous fallback that uses hardcoded thresholds.
    /// Prefer <see cref="CalculateSlaDeadlineAsync"/> in tenant-scoped code paths.
    /// </summary>
    DateTime CalculateSlaDeadline(TicketPriority priority, DateTime createdAt);

    /// <summary>
    /// Reads the org's active default <c>SlaPolicy</c> from the database
    /// and returns the resolution deadline for this priority. Falls back
    /// to the hardcoded thresholds when no policy/target row is found.
    /// </summary>
    Task<DateTime> CalculateSlaDeadlineAsync(
        Guid organizationId, TicketPriority priority, DateTime createdAt);

    /// <summary>
    /// Business-hours-aware overload. When the matching SlaTarget has
    /// <c>OperationalHours == "BusinessHours"</c>, working time is consumed
    /// against the agent group's BusinessHours profile (or the org default
    /// if the group has none).
    /// </summary>
    Task<DateTime> CalculateSlaDeadlineAsync(
        Guid organizationId, TicketPriority priority, DateTime createdAt, Guid? agentGroupId);

    string GetSlaStatus(DateTime? slaDeadline, TicketStatus status);
    Task CheckAndUpdateSlaAsync();
}
