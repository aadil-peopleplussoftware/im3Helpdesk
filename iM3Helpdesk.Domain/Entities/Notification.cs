namespace iM3Helpdesk.Domain.Entities;

public class Notification
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid UserId { get; set; }
  public string Title { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
  public string Type { get; set; } = "info";
  public bool IsRead { get; set; } = false;
  public Guid? TicketId { get; set; }
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

  public User? User { get; set; }
  public Ticket? Ticket { get; set; }
}
