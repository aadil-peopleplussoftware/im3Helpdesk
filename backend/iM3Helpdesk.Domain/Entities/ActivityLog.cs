using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class ActivityLog
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid UserId { get; set; }
  public Guid OrganizationId { get; set; }
  public string Action { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
  public string EntityType { get; set; } = string.Empty;
  public Guid? EntityId { get; set; }  // ✅ ticket ID
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;
  public User? User { get; set; }
}
