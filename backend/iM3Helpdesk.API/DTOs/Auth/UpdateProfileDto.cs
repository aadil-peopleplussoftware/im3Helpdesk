namespace iM3Helpdesk.API.DTOs.Auth;

public class UpdateProfileDto
{
    public string FullName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
}

public class ChangePasswordDto
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
    public string ConfirmNewPassword { get; set; } = string.Empty;
}

public class UpdateOrganizationDto
{
    public string Name { get; set; } = string.Empty;
    public string? SupportEmail { get; set; }
    public string? LogoUrl { get; set; }
    public string? BrandColor { get; set; }
}