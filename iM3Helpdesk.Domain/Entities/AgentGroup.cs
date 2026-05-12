using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class AgentGroup : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Name { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

  public ICollection<AgentGroupMember> Members { get; set; }
      = new List<AgentGroupMember>();
}

public class AgentGroupMember
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid AgentGroupId { get; set; }
  public Guid UserId { get; set; }
  public DateTime AddedAt { get; set; } = DateTime.UtcNow;

  public AgentGroup? Group { get; set; }
  public User? User { get; set; }
}
