using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class ChatGroupMember
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid GroupId { get; set; }
  public Guid UserId { get; set; }
  public DateTime JoinedAt { get; set; }
      = DateTime.UtcNow;
  /// <summary>
  /// Last time this member viewed the group. Used to compute
  /// per-group unread counts. Null = never opened.
  /// </summary>
  public DateTime? LastReadAt { get; set; }
  public ChatGroup? Group { get; set; }
  public User? User { get; set; }
}
