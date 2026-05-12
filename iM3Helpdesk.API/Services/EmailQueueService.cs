using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Services;

public interface IEmailQueueService
{
  Task QueueEmailAsync(string toEmail, string subject, string body);
  Task ProcessQueueAsync();
}

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
      string toEmail, string subject, string body)
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();

    var email = new EmailQueue
    {
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
        var smtpSettings = _config.GetSection("SmtpSettings");
        using var client = new System.Net.Mail.SmtpClient(
            smtpSettings["Host"]!,
            int.Parse(smtpSettings["Port"]!))
        {
          EnableSsl = true,
          Credentials = new System.Net.NetworkCredential(
                smtpSettings["FromEmail"]!,
                smtpSettings["Password"]!)
        };

        var message = new System.Net.Mail.MailMessage
        {
          From = new System.Net.Mail.MailAddress(
                smtpSettings["FromEmail"]!,
                smtpSettings["FromName"]!),
          Subject = email.Subject,
          Body = email.Body,
          IsBodyHtml = true
        };
        message.To.Add(email.ToEmail);

        await client.SendMailAsync(message);

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
