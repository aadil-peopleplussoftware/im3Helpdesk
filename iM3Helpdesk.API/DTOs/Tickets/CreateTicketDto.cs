public class CreateTicketDto
{
  public string Title { get; set; } = string.Empty;
  public string? Description { get; set; }
  public string? Category { get; set; }
  public string? Priority { get; set; }
  public string? TicketType { get; set; }
  public string? Tags { get; set; }
  public Guid? AssignedToUserId { get; set; }
  public Guid? AgentGroupId { get; set; }
}
