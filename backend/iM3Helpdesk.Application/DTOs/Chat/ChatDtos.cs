namespace iM3Helpdesk.Application.DTOs.Chat;

public class SendMessageDto
{
  public Guid ReceiverId { get; set; }
  public string Content { get; set; } = "";
  public string? MessageType { get; set; }
  public string? AttachmentUrl { get; set; }
  public string? AttachmentName { get; set; }
  public string? AttachmentType { get; set; }
}

public class ChatCreateGroupDto
{
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public List<Guid>? MemberIds { get; set; }
}

public class ChatAddMembersDto
{
  public List<Guid> MemberIds { get; set; } = new();
}

