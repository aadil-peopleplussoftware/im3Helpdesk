using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// A reminder rule that fires before an SLA target is breached.
/// e.g. "When First response approaches in 30 minutes → notify
/// Assigned agent + Group leads".
/// </summary>
public class SlaReminder : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  public Guid SlaPolicyId { get; set; }
  public SlaPolicy? Policy { get; set; }

  /// <summary>"FirstResponse" or "Resolution".</summary>
  public string TargetType { get; set; } = "FirstResponse";

  /// <summary>Notify when the deadline is this many minutes away.</summary>
  public int ApproachInMinutes { get; set; } = 30;

  /// <summary>
  /// CSV of recipient kinds: "AssignedAgent", "Group", "ReportingManager",
  /// "User:{guid}". Multiple chips supported, comma-separated.
  /// </summary>
  public string Recipients { get; set; } = "AssignedAgent";
}
