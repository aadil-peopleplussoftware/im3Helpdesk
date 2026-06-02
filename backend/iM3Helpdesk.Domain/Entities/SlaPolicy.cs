using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// A Freshdesk-style SLA Policy. Each organization has at least one
/// Default policy (auto-seeded on first read) plus any number of
/// custom policies that may match specific ticket conditions.
/// </summary>
public class SlaPolicy : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  public string Name { get; set; } = "";
  public string? Description { get; set; }

  /// <summary>One Default per org. Default cannot be deleted.</summary>
  public bool IsDefault { get; set; }
  public bool IsActive { get; set; } = true;

  /// <summary>Order in the list (lower = higher precedence).</summary>
  public int Order { get; set; }

  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? UpdatedAt { get; set; }
  public Guid? CreatedByUserId { get; set; }

  public List<SlaTarget> Targets { get; set; } = new();
  public List<SlaReminder> Reminders { get; set; } = new();
  public List<SlaEscalation> Escalations { get; set; } = new();
}
