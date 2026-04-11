namespace iM3Helpdesk.API.DTOs.Tickets;

public class TicketResponseDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string CreatedBy { get; set; } = string.Empty;
    public string? AssignedTo { get; set; }
    public DateTime CreatedAt { get; set; }
    public int CommentsCount { get; set; }
    public DateTime? SlaDeadline { get; set; }
    public string? SlaStatus { get; set; }
    public bool IsSlaBreached { get; set; }
    public string? Tags { get; set; }
    public string? TicketType { get; set; }
}
