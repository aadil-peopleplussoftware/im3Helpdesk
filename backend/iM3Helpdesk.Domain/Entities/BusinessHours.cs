using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// Per-organization business hours used by SLA targets when their
/// <c>OperationalHours == "BusinessHours"</c>. Multiple profiles per org
/// supported; exactly one is marked <see cref="IsDefault"/>. Tickets pick the
/// profile via their <see cref="AgentGroup.BusinessHoursId"/> link, falling
/// back to the default profile when their group has none.
/// </summary>
public class BusinessHours : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  public string Name { get; set; } = "Default";
  public string? Description { get; set; }
  /// <summary>One per org; cannot be deleted.</summary>
  public bool IsDefault { get; set; }

  /// <summary>"TwentyFourSeven" | "Custom"</summary>
  public string Mode { get; set; } = "Custom";

  public bool Monday    { get; set; } = true;
  public bool Tuesday   { get; set; } = true;
  public bool Wednesday { get; set; } = true;
  public bool Thursday  { get; set; } = true;
  public bool Friday    { get; set; } = true;
  public bool Saturday  { get; set; } = false;
  public bool Sunday    { get; set; } = false;

  /// <summary>Stored as "HH:mm" so EF doesn't need TimeSpan column shenanigans.</summary>
  public string StartTime { get; set; } = "09:00";
  public string EndTime   { get; set; } = "18:00";

  /// <summary>IANA timezone (e.g. "Asia/Kolkata", "UTC").</summary>
  public string Timezone { get; set; } = "UTC";

  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? UpdatedAt { get; set; }

  public ICollection<BusinessHoursHoliday> Holidays { get; set; }
      = new List<BusinessHoursHoliday>();
}

/// <summary>
/// Single holiday row attached to a <see cref="BusinessHours"/> profile.
/// Excluded from working-time calculations on the matching <see cref="Date"/>
/// (year-agnostic when <see cref="IsRecurring"/> is true).
/// </summary>
public class BusinessHoursHoliday : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }
  public Guid BusinessHoursId { get; set; }

  public string Name { get; set; } = "";
  public DateOnly Date { get; set; }
  public bool IsRecurring { get; set; } = true;

  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

  public BusinessHours? BusinessHours { get; set; }
}
