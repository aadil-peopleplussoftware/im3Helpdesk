namespace iM3Helpdesk.Application.DTOs.Tickets;

public class BulkUpdateDto
{
    public List<Guid> TicketIds { get; set; } = new();
    public string? Status { get; set; }
    public Guid? AssignedToUserId { get; set; }
}
