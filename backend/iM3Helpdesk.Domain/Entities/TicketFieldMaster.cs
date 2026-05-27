using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class TicketFieldMaster : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Field { get; set; } = string.Empty;
  public string Value { get; set; } = string.Empty;
  public string Label { get; set; } = string.Empty;
  public int SortOrder { get; set; } = 0;
  public bool IsActive { get; set; } = true;
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? UpdatedAt { get; set; }
}
