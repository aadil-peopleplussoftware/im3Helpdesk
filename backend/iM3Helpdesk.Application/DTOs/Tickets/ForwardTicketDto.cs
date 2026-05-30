namespace iM3Helpdesk.Application.DTOs.Tickets;

public class ForwardTicketDto
{
    public string ToEmail { get; set; } = string.Empty;
    public string? Message { get; set; }
    public List<string>? Cc { get; set; }
    public List<string>? Bcc { get; set; }
}
