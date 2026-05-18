using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class CustomField : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Label { get; set; } = string.Empty;
  public string FieldType { get; set; } = "text";
  public string? Options { get; set; }
  public bool IsRequired { get; set; } = false;
  public bool IsActive { get; set; } = true;
  public int SortOrder { get; set; } = 0;
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TicketCustomFieldValue : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  public Guid CustomFieldId { get; set; }
  public string Value { get; set; } = string.Empty;
  public Guid OrganizationId { get; set; }

  public Ticket? Ticket { get; set; }
  public CustomField? CustomField { get; set; }
}
