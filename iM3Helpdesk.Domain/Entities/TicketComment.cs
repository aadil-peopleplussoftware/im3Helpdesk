namespace iM3Helpdesk.Domain.Entities;

public class TicketComment
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  public Guid UserId { get; set; }
  public string Comment { get; set; } = string.Empty;
  public bool IsInternal { get; set; } = false;
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;

  // ✅ Fields already added to SQL above
  public string? EmailMessageId { get; set; }
  public string? Source { get; set; } = "web";

  // Navigation
  public User? User { get; set; }
  public Ticket? Ticket { get; set; }
}
