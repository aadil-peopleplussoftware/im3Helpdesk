using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class TodoItem : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Title { get; set; } = string.Empty;
  public string? TicketNumber { get; set; }
  public Guid? TicketId { get; set; }
  public bool IsCompleted { get; set; } = false;
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;
  public DateTime? CompletedAt { get; set; }
  public Guid OrganizationId { get; set; }
  public Guid UserId { get; set; }  
  public User? User { get; set; }
  public Ticket? Ticket { get; set; }
}
