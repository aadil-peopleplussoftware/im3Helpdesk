using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.Domain.Entities;

public class Lead
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string OrganizationName { get; set; } = string.Empty;
  public string OwnerName { get; set; } = string.Empty;
  public string WorkEmail { get; set; } = string.Empty;
  public string? Phone { get; set; }
  public string? Notes { get; set; }
  public LeadStatus Status { get; set; } = LeadStatus.Pending;
  public Guid? RegistrationToken { get; set; }
  public DateTime? TokenExpiry { get; set; }
  public DateTime? TokenUsedAt { get; set; }
  public DateTime? ApprovedAt { get; set; }
  public DateTime? RejectedAt { get; set; }
  public string? RejectionReason { get; set; }
  public Guid? ApprovedByUserId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}