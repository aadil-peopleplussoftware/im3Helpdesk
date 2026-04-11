using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AgentGroupsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public AgentGroupsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var groups = await _context.AgentGroups
        .Include(g => g.Members)
            .ThenInclude(m => m.User)
        .Select(g => new
        {
          g.Id,
          g.Name,
          g.Description,
          g.CreatedAt,
          memberCount = g.Members.Count,
          members = g.Members.Select(m => new
          {
            m.UserId,
            m.User!.FullName,
            m.User.Email,
            m.AddedAt
          }).ToList()
        })
        .ToListAsync();

    return Ok(groups);
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] CreateGroupDto dto)
  {
    var group = new AgentGroup
    {
      Name = dto.Name,
      Description = dto.Description,
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.AgentGroups.Add(group);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Group created", id = group.Id });
  }

  [HttpPost("{id}/members")]
  public async Task<IActionResult> AddMember(Guid id,
      [FromBody] AddMemberDto dto)
  {
    var exists = await _context.AgentGroupMembers
        .AnyAsync(m => m.AgentGroupId == id
            && m.UserId == dto.UserId);

    if (exists)
      return BadRequest(new { message = "Already a member" });

    var member = new AgentGroupMember
    {
      AgentGroupId = id,
      UserId = dto.UserId
    };

    _context.AgentGroupMembers.Add(member);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Member added" });
  }

  [HttpDelete("{id}/members/{userId}")]
  public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
  {
    var member = await _context.AgentGroupMembers
        .FirstOrDefaultAsync(m =>
            m.AgentGroupId == id && m.UserId == userId);

    if (member == null) return NotFound();

    _context.AgentGroupMembers.Remove(member);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Member removed" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var group = await _context.AgentGroups.FindAsync(id);
    if (group == null) return NotFound();

    _context.AgentGroups.Remove(group);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Group deleted" });
  }
}

public class CreateGroupDto
{
  public string Name { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
}

public class AddMemberDto
{
  public Guid UserId { get; set; }
}
