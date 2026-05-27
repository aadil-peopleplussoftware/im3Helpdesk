using System.ComponentModel.DataAnnotations;

namespace iM3Helpdesk.API.DTOs.Auth;

public class RegisterOrganizationRequest
{
  [Required]
  public Guid Token { get; set; }

  [Required]
  [StringLength(128, MinimumLength = 10)]
  public string Password { get; set; } = string.Empty;

  [Required]
  [StringLength(128, MinimumLength = 10)]
  [Compare(nameof(Password))]
  public string ConfirmPassword { get; set; } = string.Empty;
}