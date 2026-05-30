namespace iM3Helpdesk.Application.DTOs.Tickets;

public class UpdateCommentDto
{
    public string Comment { get; set; } = string.Empty;
    public bool IsInternal { get; set; } = false;
}