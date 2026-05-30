namespace iM3Helpdesk.Application.DTOs.Auth;

using System.ComponentModel.DataAnnotations;

public class UpdateProfileDto
{
    [Required]
    [MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(30)]
    public string? PhoneNumber { get; set; }

    [MaxLength(120)]
    public string? Department { get; set; }

    [MaxLength(120)]
    public string? Location { get; set; }

    [MaxLength(120)]
    public string? Designation { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    public DateOnly? DateOfJoining { get; set; }

    [MaxLength(30)]
    public string? Gender { get; set; }
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