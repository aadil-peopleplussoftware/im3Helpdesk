namespace iM3Helpdesk.API.DTOs.Auth;

public class LoginDto
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool LoginWithOtp { get; set; } = false;
}
