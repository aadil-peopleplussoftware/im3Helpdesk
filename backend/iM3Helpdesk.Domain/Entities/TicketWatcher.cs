namespace iM3Helpdesk.Domain.Entities;

public class TicketWatcher
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  public Guid UserId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public Guid OrganizationId { get; set; }
}