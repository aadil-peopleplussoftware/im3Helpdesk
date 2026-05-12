using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class Contact : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? PhoneNumber { get; set; }
  public string? Company { get; set; }    // ✅ Company
  public string? JobTitle { get; set; }   // ✅ Job title
  public string? Source { get; set; } = "email";
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; }
      = DateTime.UtcNow;
  public Guid? LinkedUserId { get; set; }
}
