using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class ChatGroup : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public Guid CreatedByUserId { get; set; }
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;
  public User? CreatedBy { get; set; }
  public List<ChatGroupMember> Members { get; set; }
      = new();
}
