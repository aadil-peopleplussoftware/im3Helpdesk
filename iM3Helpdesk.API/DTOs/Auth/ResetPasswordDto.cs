namespace iM3Helpdesk.API.DTOs.Auth;

public class ResetPasswordDto
{
  public string Token { get; set; } = string.Empty;
  public string NewPassword { get; set; } = string.Empty;
}
