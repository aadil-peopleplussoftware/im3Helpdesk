using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// An escalation rule that fires after an SLA target is breached.
/// e.g. "When First response is not met, escalate Immediately to
/// Assigned agent + Group leads".
/// </summary>
public class SlaEscalation : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  public Guid SlaPolicyId { get; set; }
  public SlaPolicy? Policy { get; set; }

  /// <summary>"FirstResponse" or "Resolution".</summary>
  public string TargetType { get; set; } = "FirstResponse";

  /// <summary>
  /// Minutes after breach to escalate (0 = Immediately).
  /// Freshdesk presets: 0, 30, 60, 120, 240.
  /// </summary>
  public int EscalateAfterMinutes { get; set; } = 0;

  /// <summary>CSV of recipient kinds — same shape as <see cref="SlaReminder.Recipients"/>.</summary>
  public string Recipients { get; set; } = "AssignedAgent";
}
