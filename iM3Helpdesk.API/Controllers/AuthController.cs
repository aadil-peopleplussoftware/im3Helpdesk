using iM3Helpdesk.API.DTOs.Auth;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.RateLimiting;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IConfiguration _configuration;
  private readonly IEmailService _emailService;

  public AuthController(
      ApplicationDbContext context,
      IConfiguration configuration,
      IEmailService emailService)
  {
    _context = context;
    _configuration = configuration;
    _emailService = emailService;
  }

  [HttpPost("register")]
  public async Task<IActionResult> Register([FromBody] RegisterDto dto)
  {
    if (dto.Password != dto.ConfirmPassword)
      return BadRequest(new { message = "Passwords do not match" });

    var existingUser = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (existingUser != null)
      return BadRequest(new { message = "Email already registered" });

    var organization = new Organization
    {
      Name = dto.CompanyName,
      Slug = dto.CompanyName.ToLower()
            .Replace(" ", "-")
            .Replace(".", "")
            + "-" + Guid.NewGuid().ToString()[..6],
      TrialEndsAt = DateTime.UtcNow.AddDays(30),
      IsActive = true
    };
    _context.Organizations.Add(organization);

    var verificationToken = Guid.NewGuid().ToString();
    var user = new User
    {
      FullName = dto.FullName,
      Email = dto.Email,
      PhoneNumber = dto.PhoneNumber,
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
      Role = UserRole.CompanyAdmin,
      OrganizationId = organization.Id,
      IsEmailVerified = false,
      EmailVerificationToken = verificationToken
    };
    _context.Users.Add(user);
    await _context.SaveChangesAsync();

    try
    {
      await _emailService.SendVerificationEmailAsync(
          user.Email, user.FullName, verificationToken);
      await _emailService.SendWelcomeEmailAsync(
          user.Email, user.FullName, dto.CompanyName);
    }
    catch (Exception ex)
    {
      Console.WriteLine($"Email sending failed: {ex.Message}");
    }

    return Ok(new { message = "Account created! Please check your email to verify." });
  }

  [HttpPost("register-customer")]
  public async Task<IActionResult> RegisterCustomer([FromBody] RegisterCustomerDto dto)
  {
    if (dto.Password != dto.ConfirmPassword)
      return BadRequest(new { message = "Passwords do not match" });

    var existingUser = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (existingUser != null)
      return BadRequest(new { message = "Email already registered" });

    var org = await _context.Organizations
        .FirstOrDefaultAsync(o => o.Slug == dto.OrganizationSlug && o.IsActive);

    if (org == null)
      return BadRequest(new { message = "Invalid organization. Please check your invite link." });

    var verificationToken = Guid.NewGuid().ToString();

    var user = new User
    {
      FullName = dto.FullName,
      Email = dto.Email,
      PhoneNumber = dto.PhoneNumber ?? "",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
      Role = UserRole.Customer,
      OrganizationId = org.Id,
      IsEmailVerified = false,
      EmailVerificationToken = verificationToken
    };

    _context.Users.Add(user);
    await _context.SaveChangesAsync();

    try
    {
      await _emailService.SendVerificationEmailAsync(
          user.Email, user.FullName, verificationToken);
    }
    catch (Exception ex)
    {
      Console.WriteLine($"Email sending failed: {ex.Message}");
    }

    return Ok(new { message = "Account created! Please verify your email." });
  }

  [HttpPost("login")]
  [EnableRateLimiting("login")]
  public async Task<IActionResult> Login([FromBody] LoginDto dto)
  {
    var user = await _context.Users
        .IgnoreQueryFilters()
        .Include(u => u.Organization)
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (user == null)
      return Unauthorized(new { message = "Invalid email or password" });

    // Check account locked
    if (user.LockedUntil.HasValue && user.LockedUntil > DateTime.UtcNow)
    {
      var minutesLeft = (int)(user.LockedUntil.Value - DateTime.UtcNow).TotalMinutes + 1;
      return Unauthorized(new
      {
        message = $"Account locked. Try again in {minutesLeft} minutes."
      });
    }

    if (!BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
    {
      user.FailedLoginAttempts++;

      if (user.FailedLoginAttempts >= 5)
      {
        user.LockedUntil = DateTime.UtcNow.AddMinutes(30);
        user.FailedLoginAttempts = 0;
        await _context.SaveChangesAsync();
        return Unauthorized(new
        {
          message = "Account locked for 30 minutes due to multiple failed attempts."
        });
      }

      await _context.SaveChangesAsync();
      return Unauthorized(new
      {
        message = $"Invalid email or password. " +
              $"{5 - user.FailedLoginAttempts} attempts remaining."
      });
    }

    if (!user.IsEmailVerified)
      return Unauthorized(new { message = "Please verify your email first" });

    // Organization validation check before generating token
    if (user.OrganizationId.HasValue)
    {
      var org = await _context.Organizations
          .FindAsync(user.OrganizationId.Value);

      if (org != null && !org.IsActive)
        return Unauthorized(new
        {
          message = "Your organization has been deactivated. " +
              "Please contact support."
        });
    }

    // Reset failed attempts on success
    user.FailedLoginAttempts = 0;
    user.LockedUntil = null;

    var token = GenerateJwtToken(user);
    var refreshToken = Guid.NewGuid().ToString();
    var isFirstLogin = user.LastLoginAt == null;

    user.RefreshToken = refreshToken;
    user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7);
    user.LastLoginAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    return Ok(new
    {
      token,
      refreshToken,
      isFirstLogin,
      user = new
      {
        user.FullName,
        user.Email,
        role = user.Role.ToString(),
        organizationId = user.OrganizationId,
        organizationName = user.Organization?.Name
      }
    });
  }

  [HttpPost("refresh")]
  public async Task<IActionResult> Refresh([FromBody] RefreshTokenDto dto)
  {
    var user = await _context.Users
        .IgnoreQueryFilters()
        .Include(u => u.Organization)
        .FirstOrDefaultAsync(u =>
            u.RefreshToken == dto.RefreshToken &&
            u.RefreshTokenExpiresAt > DateTime.UtcNow);

    if (user == null)
      return Unauthorized(new { message = "Invalid or expired refresh token" });

    var newToken = GenerateJwtToken(user);
    var newRefreshToken = Guid.NewGuid().ToString();

    user.RefreshToken = newRefreshToken;
    user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      token = newToken,
      refreshToken = newRefreshToken
    });
  }

  [HttpPost("verify-email")]
  public async Task<IActionResult> VerifyEmail([FromQuery] string token)
  {
    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.EmailVerificationToken == token);

    if (user == null)
      return BadRequest(new { message = "Invalid or expired verification token" });

    user.IsEmailVerified = true;
    user.EmailVerificationToken = null;
    await _context.SaveChangesAsync();

    return Ok(new { message = "Email verified! You can now login." });
  }

  [HttpPost("forgot-password")]
  public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDto dto)
  {
    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (user != null)
    {
      user.EmailVerificationToken = Guid.NewGuid().ToString();
      await _context.SaveChangesAsync();

      try
      {
        await _emailService.SendForgotPasswordEmailAsync(
            user.Email, user.FullName, user.EmailVerificationToken);
      }
      catch (Exception ex)
      {
        Console.WriteLine($"Email sending failed: {ex.Message}");
      }
    }

    return Ok(new { message = "If email exists, reset link has been sent." });
  }

  private string GenerateJwtToken(User user)
  {
    var jwtSettings = _configuration.GetSection("JwtSettings");
    var key = new SymmetricSecurityKey(
        Encoding.UTF8.GetBytes(jwtSettings["SecretKey"]!));

    var claims = new[]
    {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("organizationId", user.OrganizationId?.ToString() ?? ""),
            new Claim("fullName", user.FullName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

    var token = new JwtSecurityToken(
        issuer: jwtSettings["Issuer"],
        audience: jwtSettings["Audience"],
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(60),
        signingCredentials: new SigningCredentials(
            key, SecurityAlgorithms.HmacSha256));

    return new JwtSecurityTokenHandler().WriteToken(token);
  }
}

public class RefreshTokenDto
{
  public string RefreshToken { get; set; } = string.Empty;
}
