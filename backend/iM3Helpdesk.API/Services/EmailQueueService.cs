using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Services;

public class EmailQueueService : IEmailQueueService
{
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly IConfiguration _config;

  public EmailQueueService(
      IServiceScopeFactory scopeFactory,
      IConfiguration config)
  {
    _scopeFactory = scopeFactory;
    _config = config;
  }

  public async Task QueueEmailAsync(
      string toEmail, string subject, string body, 
      Guid? organizationId = null)
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();

    var email = new EmailQueue
    {
      OrganizationId = organizationId,
      ToEmail = toEmail,
      Subject = subject,
      Body = body,
      NextRetryAt = DateTime.UtcNow
    };

    context.EmailQueues.Add(email);
    await context.SaveChangesAsync();
  }

  public async Task ProcessQueueAsync()
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();
    var emailService = scope.ServiceProvider
        .GetRequiredService<IEmailService>();

    var pendingEmails = await context.EmailQueues
        .Where(e => !e.IsSent
            && e.RetryCount < 3
            && e.NextRetryAt <= DateTime.UtcNow)
        .Take(10)
        .ToListAsync();

    foreach (var email in pendingEmails)
    {
      try
      {
        
        await emailService.SendAsync(
            email.ToEmail, email.Subject, email.Body,
            organizationId: email.OrganizationId);

        email.IsSent = true;
        email.SentAt = DateTime.UtcNow;
      }
      catch (Exception ex)
      {
        email.RetryCount++;
        email.ErrorMessage = ex.Message;
        email.NextRetryAt = DateTime.UtcNow
            .AddMinutes(Math.Pow(2, email.RetryCount) * 5);
      }
    }

    await context.SaveChangesAsync();
  }
}
