namespace iM3Helpdesk.Application.Contracts.Services;

public interface IEmailQueueService
{
    Task QueueEmailAsync(string toEmail, string subject, string body,
        Guid? organizationId = null);

    Task ProcessQueueAsync();
}
