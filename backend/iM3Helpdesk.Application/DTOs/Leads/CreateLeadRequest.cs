using System.ComponentModel.DataAnnotations;

namespace iM3Helpdesk.Application.DTOs.Leads;

public class CreateLeadRequest
{
  [Required]
  [StringLength(200, MinimumLength = 2)]
  public string OrganizationName { get; set; } = string.Empty;

  [Required]
  [StringLength(200, MinimumLength = 2)]
  public string OwnerName { get; set; } = string.Empty;

  [Required]
  [EmailAddress]
  [StringLength(256)]
  public string WorkEmail { get; set; } = string.Empty;

  [StringLength(30)]
  public string? Phone { get; set; }

  [StringLength(2000)]
  public string? Notes { get; set; }
}