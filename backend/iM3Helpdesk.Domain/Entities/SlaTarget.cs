using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// One row of an SLA matrix: response &amp; resolution targets for a
/// specific ticket priority. Stored in minutes for precision.
/// </summary>
public class SlaTarget : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  public Guid SlaPolicyId { get; set; }
  public SlaPolicy? Policy { get; set; }

  public TicketPriority Priority { get; set; }

  /// <summary>Time agent has to give the first response (in minutes).</summary>
  public int FirstResponseMinutes { get; set; }
  /// <summary>Time to resolve the ticket end-to-end (in minutes).</summary>
  public int ResolutionMinutes { get; set; }

  /// <summary>"BusinessHours" or "CalendarHours" (24x7).</summary>
  public string OperationalHours { get; set; } = "BusinessHours";

  /// <summary>Whether escalations apply for this priority row.</summary>
  public bool EscalationEnabled { get; set; } = true;
}
