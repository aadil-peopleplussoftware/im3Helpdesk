using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;

namespace iM3Helpdesk.API.Services;

public interface INotificationService
{
    Task CreateAsync(Guid userId, Guid orgId, string title,
        string message, string type = "info", Guid? ticketId = null);
    Task CreateActivityAsync(Guid userId, Guid orgId, string action,
        string description, string entityType, Guid? entityId = null);
}

public class NotificationService : INotificationService
{
    private readonly ApplicationDbContext _context;

    public NotificationService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task CreateAsync(Guid userId, Guid orgId, string title,
        string message, string type = "info", Guid? ticketId = null)
    {
        var notification = new Notification
        {
            Title = title,
            Message = message,
            Type = type,
            UserId = userId,
            OrganizationId = orgId,
            TicketId = ticketId
        };
        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync();
    }

    public async Task CreateActivityAsync(Guid userId, Guid orgId,
        string action, string description, string entityType, Guid? entityId = null)
    {
        var log = new ActivityLog
        {
            Action = action,
            Description = description,
            EntityType = entityType,
            EntityId = entityId,
            UserId = userId,
            OrganizationId = orgId
        };
        _context.ActivityLogs.Add(log);
        await _context.SaveChangesAsync();
    }
}