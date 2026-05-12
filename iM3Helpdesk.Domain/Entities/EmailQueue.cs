namespace iM3Helpdesk.Domain.Entities;

public class EmailQueue
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string ToEmail { get; set; } = string.Empty;
  public string Subject { get; set; } = string.Empty;
  public string Body { get; set; } = string.Empty;
  public bool IsSent { get; set; } = false;
  public int RetryCount { get; set; } = 0;
  public string? ErrorMessage { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? SentAt { get; set; }
  public DateTime? NextRetryAt { get; set; }
}
