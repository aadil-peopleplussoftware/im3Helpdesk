using iM3Helpdesk.API.DTOs.Auth;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/auth")]
public class OnboardingController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IConfiguration _configuration;

  public OnboardingController(ApplicationDbContext context, IConfiguration configuration)
  {
    _context = context;
    _configuration = configuration;
  }

  [HttpGet("verify-token")]
  [AllowAnonymous]
  public async Task<IActionResult> VerifyToken([FromQuery] Guid token)
  {
    var lead = await _context.Leads
        .AsNoTracking()
        .FirstOrDefaultAsync(x =>
            x.RegistrationToken == token &&
            x.Status == LeadStatus.Approved &&
            x.TokenUsedAt == null &&
            x.TokenExpiry.HasValue &&
            x.TokenExpiry > DateTime.UtcNow);

    if (lead == null)
      return BadRequest(new { message = "Invalid or expired token." });

    return Ok(new
    {
      organizationName = lead.OrganizationName,
      workEmail = lead.WorkEmail,
      ownerName = lead.OwnerName
    });
  }

  [HttpPost("register-org")]
  [AllowAnonymous]
  public async Task<IActionResult> RegisterOrg([FromBody] RegisterOrganizationRequest dto)
  {
    if (!ModelState.IsValid)
      return ValidationProblem(ModelState);

    var lead = await _context.Leads
        .FirstOrDefaultAsync(x =>
            x.RegistrationToken == dto.Token &&
            x.Status == LeadStatus.Approved &&
            x.TokenUsedAt == null &&
            x.TokenExpiry.HasValue &&
            x.TokenExpiry > DateTime.UtcNow);

    if (lead == null)
      return BadRequest(new { message = "Invalid or expired token." });

    var normalizedEmail = lead.WorkEmail.Trim().ToLowerInvariant();

    var existingUser = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == normalizedEmail);

    if (existingUser != null)
      return BadRequest(new { message = "Email already registered." });

    var existingOrg = await _context.Organizations
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(o => o.SupportEmail == normalizedEmail);

    if (existingOrg != null)
      return BadRequest(new { message = "Organization already exists." });

    await using var transaction = await _context.Database.BeginTransactionAsync();

    try
    {
      var organization = new Organization
      {
        Name = lead.OrganizationName.Trim(),
        Slug = BuildUniqueSlug(lead.OrganizationName),
        SupportEmail = normalizedEmail,
        TrialEndsAt = DateTime.UtcNow.AddDays(30),
        IsActive = true,
        CreatedAt = DateTime.UtcNow
      };

      var adminUser = new User
      {
        FullName = lead.OwnerName.Trim(),
        Email = normalizedEmail,
        PhoneNumber = string.IsNullOrWhiteSpace(lead.Phone) ? null : lead.Phone.Trim(),
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
        Role = UserRole.CompanyAdmin,
        Organization = organization,
        OrganizationId = organization.Id,
        IsEmailVerified = true,
        CreatedAt = DateTime.UtcNow
      };

      lead.Status = LeadStatus.Completed;
      lead.TokenUsedAt = DateTime.UtcNow;
      lead.UpdatedAt = DateTime.UtcNow;

      var token = GenerateJwtToken(adminUser);
      var refreshToken = GenerateRefreshToken();

      SetAuthCookies(token, refreshToken);

      adminUser.RefreshToken = HashRefreshToken(refreshToken);
      adminUser.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7);

      _context.Organizations.Add(organization);
      _context.Users.Add(adminUser);
      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Organization created successfully.",
        organizationId = organization.Id,
        adminEmail = adminUser.Email,
        token,
        refreshToken,
        isFirstLogin = true,
        user = new
        {
          adminUser.FullName,
          adminUser.Email,
          role = adminUser.Role.ToString(),
          organizationId = organization.Id,
          organizationName = organization.Name
        }
      });
    }
    catch
    {
      await transaction.RollbackAsync();
      throw;
    }
  }

  private static string BuildUniqueSlug(string organizationName)
  {
    var baseSlug = new string(organizationName
        .Trim()
        .ToLowerInvariant()
        .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
        .ToArray())
        .Replace("--", "-");

    baseSlug = string.Join('-', baseSlug
        .Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    return $"{baseSlug}-{Guid.NewGuid().ToString("N")[..8]}";
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
        signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

    return new JwtSecurityTokenHandler().WriteToken(token);
  }

  private void SetAuthCookies(string accessToken, string refreshToken)
  {
    var secureCookie = Request.IsHttps;
    var accessCookieOptions = new CookieOptions
    {
      HttpOnly = true,
      Secure = secureCookie,
      SameSite = SameSiteMode.None,
      Expires = DateTimeOffset.UtcNow.AddMinutes(60),
      Path = "/"
    };

    var refreshCookieOptions = new CookieOptions
    {
      HttpOnly = true,
      Secure = secureCookie,
      SameSite = SameSiteMode.None,
      Expires = DateTimeOffset.UtcNow.AddDays(7),
      Path = "/api/Auth/refresh"
    };

    Response.Cookies.Append("im3_access", accessToken, accessCookieOptions);
    Response.Cookies.Append("im3_refresh", refreshToken, refreshCookieOptions);
  }

  private static string GenerateRefreshToken()
  {
    var bytes = RandomNumberGenerator.GetBytes(32);
    return Convert.ToBase64String(bytes);
  }

  private static string HashRefreshToken(string refreshToken)
  {
    var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));
    return Convert.ToHexString(bytes);
  }
}