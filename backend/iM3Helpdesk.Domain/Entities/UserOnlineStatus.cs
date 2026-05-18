namespace iM3Helpdesk.Domain.Entities;

public class UserOnlineStatus
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid UserId { get; set; }
  public bool IsOnline { get; set; } = false;
  public DateTime LastSeen { get; set; } = DateTime.UtcNow;
  public string? ConnectionId { get; set; }
  public User? User { get; set; }
}
