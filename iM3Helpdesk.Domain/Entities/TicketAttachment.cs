using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class TicketAttachment : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  public Guid? CommentId { get; set; }
  public string FileName { get; set; } = string.Empty;
  public string FileUrl { get; set; } = string.Empty;
  public string ContentType { get; set; } = string.Empty;
  public long FileSize { get; set; }
  public Guid UploadedByUserId { get; set; }
  public Guid OrganizationId { get; set; }
  public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

  public Ticket? Ticket { get; set; }
  public User? UploadedBy { get; set; }
}
