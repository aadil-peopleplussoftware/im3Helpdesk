namespace iM3Helpdesk.API.DTOs.Tickets;

public class CreateTicketDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Priority { get; set; } = "Medium";
    public string TicketType { get; set; } = "Support";
}
