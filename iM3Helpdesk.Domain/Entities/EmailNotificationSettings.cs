using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class EmailNotificationSetting : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string NotifKey { get; set; } = string.Empty;
  public bool IsEnabled { get; set; } = true;
  public Guid OrganizationId { get; set; }
}
