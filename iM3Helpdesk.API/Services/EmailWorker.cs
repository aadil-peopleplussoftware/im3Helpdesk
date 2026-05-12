namespace iM3Helpdesk.API.Services;

public class EmailWorker : BackgroundService
{
  private readonly IEmailQueueService _emailQueue;
  private readonly ILogger<EmailWorker> _logger;

  public EmailWorker(
      IEmailQueueService emailQueue,
      ILogger<EmailWorker> logger)
  {
    _emailQueue = emailQueue;
    _logger = logger;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        await _emailQueue.ProcessQueueAsync();
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Email worker error");
      }
      await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
    }
  }
}
