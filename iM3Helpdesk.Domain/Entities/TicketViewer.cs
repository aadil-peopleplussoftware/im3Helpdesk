namespace iM3Helpdesk.Domain.Entities;

public class TicketViewer
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  public Guid UserId { get; set; }
  public string UserName { get; set; } = string.Empty;
  public DateTime ViewedAt { get; set; } = DateTime.UtcNow;
  public Guid OrganizationId { get; set; }
}
