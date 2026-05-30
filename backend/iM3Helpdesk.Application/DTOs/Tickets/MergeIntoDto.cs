namespace iM3Helpdesk.Application.DTOs.Tickets;

public class MergeIntoDto
{
    public Guid DuplicateTicketId { get; set; }
    public string? Note { get; set; }
}
