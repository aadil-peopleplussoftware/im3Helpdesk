using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class ChatMessage : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Content { get; set; } = "";
  public Guid SenderId { get; set; }
  public Guid? ReceiverId { get; set; }
  public Guid? GroupId { get; set; }
  public Guid ConversationId { get; set; }
  public bool IsRead { get; set; } = false;
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;
  public DateTime? ReadAt { get; set; }
  public string? AttachmentUrl { get; set; }
  public string? AttachmentName { get; set; }
  public string? AttachmentType { get; set; }
  public long? AttachmentSize { get; set; }
  public string MessageType { get; set; } = "text";
  public Guid OrganizationId { get; set; }
  public User? Sender { get; set; }
  public User? Receiver { get; set; }
  public ChatGroup? Group { get; set; }
}
