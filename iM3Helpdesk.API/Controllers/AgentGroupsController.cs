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
  private readonly ICurrentTenantService _tenant;

  public AgentGroupsController(
      ApplicationDbContext context,
      ICurrentTenantService tenant)
  {
    _context = context;
    _tenant = tenant;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var orgId = _tenant.OrganizationId!.Value;

    var groups = await _context.AgentGroups
        .AsNoTracking()
        .Where(g => g.OrganizationId == orgId)
        .Select(g => new
        {
          g.Id,
          g.Name,
          g.Description,
          MemberCount = _context
                .AgentGroupMembers
                .Count(m => m.AgentGroupId == g.Id),
          MemberIds = _context
                .AgentGroupMembers
                .Where(m => m.AgentGroupId == g.Id)
                .Select(m => m.UserId.ToString())
                .ToList()
        })
        .OrderBy(g => g.Name)
        .ToListAsync();

    return Ok(groups);
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] AgentGroupDto dto)
  {
    var orgId = _tenant.OrganizationId!.Value;

    var group = new AgentGroup
    {
      Name = dto.Name?.Trim() ?? "",
      Description = dto.Description ?? "",
      OrganizationId = orgId
    };

    _context.AgentGroups.Add(group);
    await _context.SaveChangesAsync();

    // Add members
    if (dto.MemberIds?.Any() == true)
    {
      foreach (var memberId in dto.MemberIds)
      {
        if (Guid.TryParse(
            memberId, out var uid))
        {
          _context.AgentGroupMembers.Add(
              new AgentGroupMember
              {
                AgentGroupId = group.Id,
                UserId = uid
              });
        }
      }
      await _context.SaveChangesAsync();
    }

    return Ok(new
    {
      id = group.Id,
      name = group.Name,
      message = "Group created"
    });
  }

  // ✅ PUT — explicit route
  [HttpPut("{id}")]
  public async Task<IActionResult> Update(
      Guid id, [FromBody] AgentGroupDto dto)
  {
    var orgId = _tenant.OrganizationId!.Value;

    var group = await _context.AgentGroups
        .FirstOrDefaultAsync(g =>
            g.Id == id &&
            g.OrganizationId == orgId);

    if (group == null) return NotFound();

    group.Name = dto.Name?.Trim()
        ?? group.Name;
    group.Description =
        dto.Description ?? group.Description;

    // Remove old members
    var oldMembers = await _context
        .AgentGroupMembers
        .Where(m => m.AgentGroupId == id)
        .ToListAsync();
    _context.AgentGroupMembers
        .RemoveRange(oldMembers);

    // Add new members
    if (dto.MemberIds?.Any() == true)
    {
      foreach (var memberId in dto.MemberIds)
      {
        if (Guid.TryParse(
            memberId, out var uid))
        {
          _context.AgentGroupMembers.Add(
              new AgentGroupMember
              {
                AgentGroupId = id,
                UserId = uid
              });
        }
      }
    }

    await _context.SaveChangesAsync();
    return Ok(new { message = "Group updated" });
  }

  // ✅ DELETE — with cascade
  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var orgId = _tenant.OrganizationId!.Value;

    var group = await _context.AgentGroups
        .FirstOrDefaultAsync(g =>
            g.Id == id &&
            g.OrganizationId == orgId);

    if (group == null) return NotFound();

    // Remove members first
    var members = await _context
        .AgentGroupMembers
        .Where(m => m.AgentGroupId == id)
        .ToListAsync();
    _context.AgentGroupMembers
        .RemoveRange(members);

    // Unassign tickets from this group
    var tickets = await _context.Tickets
        .Where(t => t.AgentGroupId == id)
        .ToListAsync();
    tickets.ForEach(t =>
        t.AgentGroupId = null);

    _context.AgentGroups.Remove(group);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Group deleted"
    });
  }

  [HttpPost("{id}/members/{userId}")]
  public async Task<IActionResult> AddMember(
      Guid id, Guid userId)
  {
    var exists = await _context
        .AgentGroupMembers
        .AnyAsync(m =>
            m.AgentGroupId == id &&
            m.UserId == userId);

    if (!exists)
    {
      _context.AgentGroupMembers.Add(
          new AgentGroupMember
          {
            AgentGroupId = id,
            UserId = userId
          });
      await _context.SaveChangesAsync();
    }

    return Ok(new { message = "Member added" });
  }

  [HttpDelete("{id}/members/{userId}")]
  public async Task<IActionResult> RemoveMember(
      Guid id, Guid userId)
  {
    var member = await _context
        .AgentGroupMembers
        .FirstOrDefaultAsync(m =>
            m.AgentGroupId == id &&
            m.UserId == userId);

    if (member != null)
    {
      _context.AgentGroupMembers.Remove(member);
      await _context.SaveChangesAsync();
    }

    return Ok(new { message = "Member removed" });
  }
}

public class AgentGroupDto
{
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public List<string>? MemberIds { get; set; }
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
