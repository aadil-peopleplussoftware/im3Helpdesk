using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class TicketComment : IMustHaveTenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Comment { get; set; } = string.Empty;
    public Guid TicketId { get; set; }
    public Guid UserId { get; set; }
    public Guid OrganizationId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsInternal { get; set; } = false;

    public Ticket? Ticket { get; set; }
    public User? User { get; set; }
}
