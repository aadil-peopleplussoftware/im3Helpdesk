namespace iM3Helpdesk.Domain.Entities;

public class CallLog
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid CallerId { get; set; }
  public User Caller { get; set; } = null!;
  public Guid ReceiverId { get; set; }
  public User Receiver { get; set; } = null!;
  public string CallType { get; set; } = "audio";
  public string Status { get; set; } = "ringing";
  public int DurationSeconds { get; set; } = 0;
  public Guid OrganizationId { get; set; }
  public DateTime StartedAt { get; set; } = DateTime.UtcNow;
  public DateTime? EndedAt { get; set; }
  public bool IsRead { get; set; } = false;
}
