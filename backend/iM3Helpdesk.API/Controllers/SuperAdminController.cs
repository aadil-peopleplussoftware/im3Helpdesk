using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/superadmin")]
// Only SuperAdmin can access any endpoint in this controller
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class SuperAdminController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public SuperAdminController(ApplicationDbContext context)
  {
    _context = context;
  }

  [HttpGet("organizations")]
  public async Task<IActionResult> GetOrganizations()
  {
    var orgs = await _context.Organizations
        .Select(o => new
        {
          o.Id,
          o.Name,
          o.Slug,
          o.SupportEmail,
          o.IsActive,
          o.TrialEndsAt,
          o.CreatedAt,
          totalUsers = _context.Users
                .IgnoreQueryFilters()
                .Count(u => u.OrganizationId == o.Id),
          totalTickets = _context.Tickets
                .IgnoreQueryFilters()
                .Count(t => t.OrganizationId == o.Id)
        })
        .OrderByDescending(o => o.CreatedAt)
        .ToListAsync();

    return Ok(orgs);
  }

  [HttpPut("organizations/{id}/toggle")]
  public async Task<IActionResult> ToggleOrganization(Guid id)
  {
    var org = await _context.Organizations.FindAsync(id);
    if (org == null) return NotFound();

    org.IsActive = !org.IsActive;
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = $"Organization {(org.IsActive ? "activated" : "deactivated")}",
      isActive = org.IsActive
    });
  }

  [HttpGet("users")]
  public async Task<IActionResult> GetAllUsers()
  {
    var users = await _context.Users
        .IgnoreQueryFilters()
        .Include(u => u.Organization)
        .OrderByDescending(u => u.CreatedAt)
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
          organization = u.Organization == null ? null : new
          {
            u.Organization.Name,
            u.Organization.IsActive
          }
        })
        .ToListAsync();

    return Ok(users);
  }

  [HttpGet("stats")]
  public async Task<IActionResult> GetStats()
  {
    var stats = new
    {
      totalOrganizations = await _context.Organizations.CountAsync(),
      activeOrganizations = await _context.Organizations
            .CountAsync(o => o.IsActive),
      totalUsers = await _context.Users
            .IgnoreQueryFilters().CountAsync(),
      totalTickets = await _context.Tickets
            .IgnoreQueryFilters().CountAsync(),
      newOrgsThisMonth = await _context.Organizations
            .CountAsync(o => o.CreatedAt >= DateTime.UtcNow.AddDays(-30)),
      recentOrgs = await _context.Organizations
            .OrderByDescending(o => o.CreatedAt)
            .Take(5)
            .Select(o => new
            {
              o.Id,
              o.Name,
              o.IsActive,
              o.CreatedAt,
              o.TrialEndsAt
            })
            .ToListAsync()
    };

    return Ok(stats);
  }
}
