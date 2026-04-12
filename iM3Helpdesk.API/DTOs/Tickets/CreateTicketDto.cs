namespace iM3Helpdesk.API.DTOs.Tickets;

public class CreateTicketDto
{
  public string Title { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
  public string Category { get; set; } = "General";
  public string Priority { get; set; } = "Medium";
  public string TicketType { get; set; } = "Support";
  public string Status { get; set; } = "Open";
  public Guid? AssignedToUserId { get; set; }
  public Guid? AgentGroupId { get; set; }
  public string? Tags { get; set; }
}
