namespace iM3Helpdesk.Application.DTOs.Auth;

public class ResetPasswordDto
{
  public string Token { get; set; } = string.Empty;
  public string NewPassword { get; set; } = string.Empty;
}
