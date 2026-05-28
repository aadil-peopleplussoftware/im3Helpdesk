using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.Domain.Entities;

/// <summary>
/// Per-organization override of what each <see cref="UserRole"/> can do on
/// a given application module. Missing rows fall back to the system defaults
/// hard-coded in the Role Rights catalog.
/// </summary>
public class RolePermission
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid OrganizationId { get; set; }

  /// <summary>One of the four built-in <see cref="UserRole"/> values.</summary>
  public UserRole Role { get; set; }

  /// <summary>Module key, e.g. "tickets", "agents", "holiday-setup".</summary>
  public string Module { get; set; } = string.Empty;

  public bool CanView { get; set; }
  public bool CanAdd { get; set; }
  public bool CanEdit { get; set; }
  public bool CanDelete { get; set; }
  public bool CanExport { get; set; }

  public Guid? UpdatedByUserId { get; set; }
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
