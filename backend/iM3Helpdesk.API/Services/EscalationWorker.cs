namespace iM3Helpdesk.API.Services;

public class EscalationWorker : BackgroundService
{
  private readonly IEscalationService _escalation;
  private readonly ILogger<EscalationWorker> _logger;

  public EscalationWorker(
      IEscalationService escalation,
      ILogger<EscalationWorker> logger)
  {
    _escalation = escalation;
    _logger = logger;
  }

  protected override async Task ExecuteAsync(
      CancellationToken stoppingToken)
  {
    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        await _escalation.CheckAndEscalateAsync();
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Escalation worker error");
      }
      await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
    }
  }
}
