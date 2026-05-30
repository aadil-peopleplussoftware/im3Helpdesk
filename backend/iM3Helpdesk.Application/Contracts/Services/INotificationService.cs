namespace iM3Helpdesk.Application.Contracts.Services;

public interface INotificationService
{
    Task CreateAsync(Guid userId, Guid orgId, string title,
        string message, string type = "info", Guid? ticketId = null);

    Task CreateActivityAsync(Guid userId, Guid orgId, string action,
        string description, string entityType, Guid? entityId = null);
}
