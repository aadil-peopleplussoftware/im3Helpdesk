namespace iM3Helpdesk.Application.DTOs.Auth;

public class RegisterCustomerDto
{
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? PhoneNumber { get; set; }
  public string Password { get; set; } = string.Empty;
  public string ConfirmPassword { get; set; } = string.Empty;
  public string OrganizationSlug { get; set; } = string.Empty;
}
