using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using iM3Helpdesk.Application.Contracts.Services;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AgentsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly IEmailService _emailService;

  public AgentsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      IEmailService emailService)
  {
    _context = context;
    _tenantService = tenantService;
    _emailService = emailService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var agents = await _context.Users
        .IgnoreQueryFilters()
        .Where(u =>
            u.OrganizationId == _tenantService.OrganizationId &&
            (u.Role == UserRole.Agent ||
             u.Role == UserRole.CompanyAdmin))
        .Select(u => new
        {
          u.Id,
          u.FullName,
          u.Email,
          u.PhoneNumber,
          Role = u.Role.ToString(),
          u.IsEmailVerified,
          u.CreatedAt,
          u.LastLoginAt,
          // ✅ IsActive: LockedUntil nahi hai ya past mein hai to active
          IsActive = !u.LockedUntil.HasValue ||
              u.LockedUntil < DateTime.UtcNow
        })
        .ToListAsync();

    return Ok(agents);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            u.OrganizationId == _tenantService.OrganizationId);

    if (agent == null) return NotFound();

    return Ok(new
    {
      agent.Id,
      agent.FullName,
      agent.Email,
      agent.PhoneNumber,
      Role = agent.Role.ToString(),
      agent.Signature,
      agent.PhotoUrl,
      agent.IsEmailVerified,
      agent.LastLoginAt,
      agent.CreatedAt
    });
  }

  [HttpPost("invite")]
  public async Task<IActionResult> InviteAgent(
      [FromBody] InviteAgentDto dto)
  {
    var existingUser = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (existingUser != null)
      return BadRequest(
          new { message = "Email already registered" });

    var tempPassword = GenerateTempPassword();

    var agent = new iM3Helpdesk.Domain.Entities.User
    {
      FullName = dto.FullName,
      Email = dto.Email,
      PhoneNumber = dto.PhoneNumber ?? "",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
      Role = ParseRole(dto.Role),
      OrganizationId = _tenantService.OrganizationId!.Value,
      IsEmailVerified = true,
      Signature = dto.Signature ?? "",
      PhotoUrl = dto.PhotoUrl ?? ""
    };

    _context.Users.Add(agent);

    if (dto.GroupIds?.Any() == true)
    {
      foreach (var groupId in dto.GroupIds)
      {
        _context.AgentGroupMembers.Add(
            new iM3Helpdesk.Domain.Entities.AgentGroupMember
            {
              AgentGroupId = groupId,
              UserId = agent.Id
            });
      }
    }

    await _context.SaveChangesAsync();

    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    try
    {
      // ✅ FIX: Use proper invite email with all correct params
      await _emailService.SendAgentInviteAsync(
          agent.Email,
          agent.FullName,
          org?.Name ?? "Your Company",
          tempPassword,org?.Id);
    }
    catch { }

    return Ok(new
    {
      message = "Agent invited successfully",
      tempPassword = tempPassword,
      agentId = agent.Id
    });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> UpdateAgent(
      Guid id, [FromBody] UpdateAgentDto dto)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            u.OrganizationId == _tenantService.OrganizationId);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    if (!string.IsNullOrEmpty(dto.FullName))
      agent.FullName = dto.FullName;

    if (!string.IsNullOrEmpty(dto.Role))
      agent.Role = ParseRole(dto.Role);

    if (dto.Signature != null)
      agent.Signature = dto.Signature;

    if (dto.PhotoUrl != null)
      agent.PhotoUrl = dto.PhotoUrl;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Agent updated" });
  }

  [HttpPut("{id}/toggle-active")]
  public async Task<IActionResult> ToggleActive(Guid id)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == id);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    if (agent.LockedUntil.HasValue &&
        agent.LockedUntil > DateTime.UtcNow)
    {
      agent.LockedUntil = null;
      agent.FailedLoginAttempts = 0;
    }
    else
    {
      agent.LockedUntil = DateTime.UtcNow.AddYears(100);
    }

    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Agent status updated",
      isActive = !agent.LockedUntil.HasValue ||
          agent.LockedUntil < DateTime.UtcNow
    });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            u.Role != UserRole.SuperAdmin);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    _context.Users.Remove(agent);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Agent deleted" });
  }

  private string GenerateTempPassword()
  {
    return "Agent@" + Guid.NewGuid().ToString()[..6];
  }

  private static UserRole ParseRole(string? role)
  {
    return role switch
    {
      "Administrator" => UserRole.CompanyAdmin,
      "Agent" => UserRole.Agent,
      _ => UserRole.Agent
    };
  }
}

public class InviteAgentDto
{
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? PhoneNumber { get; set; }
  public string Role { get; set; } = "Agent";
  public string? Signature { get; set; }
  public string? PhotoUrl { get; set; }
  public List<Guid>? GroupIds { get; set; }
}

public class UpdateAgentDto
{
  public string? FullName { get; set; }
  public string? Role { get; set; }
  public string? Signature { get; set; }
  public string? PhotoUrl { get; set; }
}
