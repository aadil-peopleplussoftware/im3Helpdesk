using System.Security.Claims;
using iM3Helpdesk.API.Dtos;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

/// <summary>
/// Freshdesk-style Business Hours admin. Each org has a Default profile
/// (auto-seeded, never deletable). Custom profiles can be added and assigned
/// to specific <see cref="AgentGroup"/>s; tickets in unassigned groups fall
/// back to Default. Holidays are excluded from working-time math; "Groups"
/// tab manages which groups follow this profile.
/// </summary>
[ApiController]
[Route("api/business-hours")]
[Authorize(Roles = "CompanyAdmin,SuperAdmin")]
public class BusinessHoursController : ControllerBase
{
  private readonly ApplicationDbContext _db;
  private readonly ICurrentTenantService _tenant;
  private readonly ILogger<BusinessHoursController> _logger;

  public BusinessHoursController(
      ApplicationDbContext db,
      ICurrentTenantService tenant,
      ILogger<BusinessHoursController> logger)
  {
    _db = db;
    _tenant = tenant;
    _logger = logger;
  }

  private Guid OrgIdOrThrow()
  {
    var id = _tenant.OrganizationId;
    if (id == null || id == Guid.Empty)
      throw new InvalidOperationException("Tenant context missing.");
    return id.Value;
  }

  /// <summary>Idempotent: ensure exactly one Default profile exists per org.</summary>
  private async Task EnsureDefaultAsync(Guid orgId)
  {
    var hasDefault = await _db.BusinessHours
        .AnyAsync(b => b.OrganizationId == orgId && b.IsDefault);
    if (hasDefault) return;

    // If a legacy non-default row exists (older single-row schema), promote it.
    var legacy = await _db.BusinessHours
        .Where(b => b.OrganizationId == orgId)
        .OrderBy(b => b.CreatedAt)
        .FirstOrDefaultAsync();
    if (legacy != null)
    {
      legacy.IsDefault = true;
      if (string.IsNullOrWhiteSpace(legacy.Name)) legacy.Name = "Default";
      if (string.IsNullOrWhiteSpace(legacy.Mode)) legacy.Mode = "Custom";
      await _db.SaveChangesAsync();
      return;
    }

    _db.BusinessHours.Add(new BusinessHours
    {
      OrganizationId = orgId,
      Name = "Default",
      Description = "Default Business Calendar",
      IsDefault = true,
      Mode = "Custom",
      Timezone = "UTC",
    });
    await _db.SaveChangesAsync();
  }

  // ───── List ─────────────────────────────────────────────

  [HttpGet]
  public async Task<ActionResult<List<BusinessHoursListItemDto>>> List()
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultAsync(orgId);

    var rows = await _db.BusinessHours
        .AsNoTracking()
        .OrderByDescending(b => b.IsDefault)
        .ThenBy(b => b.CreatedAt)
        .Select(b => new BusinessHoursListItemDto
        {
          Id = b.Id,
          Name = b.Name,
          IsDefault = b.IsDefault,
          Timezone = b.Timezone,
          GroupsCount = _db.AgentGroups.Count(g => g.BusinessHoursId == b.Id),
        })
        .ToListAsync();

    return Ok(rows);
  }

  // ───── Detail ───────────────────────────────────────────

  [HttpGet("{id:guid}")]
  public async Task<ActionResult<BusinessHoursDetailDto>> Get(Guid id)
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultAsync(orgId);

    var b = await _db.BusinessHours
        .AsNoTracking()
        .Include(x => x.Holidays)
        .FirstOrDefaultAsync(x => x.Id == id);
    if (b == null) return NotFound();

    var allGroups = await _db.AgentGroups
        .AsNoTracking()
        .OrderBy(g => g.Name)
        .Select(g => new BusinessHoursGroupDto
        {
          Id = g.Id,
          Name = g.Name,
          Assigned = g.BusinessHoursId == id,
        })
        .ToListAsync();

    return Ok(new BusinessHoursDetailDto
    {
      Id = b.Id,
      Name = b.Name,
      Description = b.Description,
      IsDefault = b.IsDefault,
      Mode = b.Mode,
      Timezone = b.Timezone,
      Monday = b.Monday, Tuesday = b.Tuesday, Wednesday = b.Wednesday,
      Thursday = b.Thursday, Friday = b.Friday, Saturday = b.Saturday, Sunday = b.Sunday,
      StartTime = b.StartTime,
      EndTime = b.EndTime,
      Holidays = b.Holidays
          .OrderBy(h => h.Date)
          .Select(h => new BusinessHoursHolidayDto
          {
            Id = h.Id,
            Name = h.Name,
            Date = h.Date.ToString("yyyy-MM-dd"),
            IsRecurring = h.IsRecurring,
          }).ToList(),
      Groups = allGroups,
    });
  }

  // ───── Create ───────────────────────────────────────────

  [HttpPost]
  public async Task<ActionResult<BusinessHoursDetailDto>> Create(
      [FromBody] BusinessHoursUpsertDto body)
  {
    try
    {
      var orgId = OrgIdOrThrow();
      if (string.IsNullOrWhiteSpace(body.Name))
        return BadRequest("Name is required.");

      var b = Apply(new BusinessHours
      {
        OrganizationId = orgId,
        IsDefault = false,
      }, body);
      _db.BusinessHours.Add(b);
      await _db.SaveChangesAsync();
      return await Get(b.Id);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Create business hours failed");
      return StatusCode(500, new { message = ex.Message });
    }
  }

  // ───── Update ───────────────────────────────────────────

  [HttpPut("{id:guid}")]
  public async Task<ActionResult<BusinessHoursDetailDto>> Update(
      Guid id, [FromBody] BusinessHoursUpsertDto body)
  {
    try
    {
      var b = await _db.BusinessHours.FirstOrDefaultAsync(x => x.Id == id);
      if (b == null) return NotFound();
      Apply(b, body);
      b.UpdatedAt = DateTime.UtcNow;
      await _db.SaveChangesAsync();
      return await Get(b.Id);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Update business hours failed");
      return StatusCode(500, new { message = ex.Message });
    }
  }

  private static BusinessHours Apply(BusinessHours b, BusinessHoursUpsertDto body)
  {
    b.Name = string.IsNullOrWhiteSpace(body.Name) ? b.Name : body.Name.Trim();
    b.Description = body.Description?.Trim();
    b.Mode = string.IsNullOrWhiteSpace(body.Mode) ? "Custom" : body.Mode.Trim();
    b.Timezone = string.IsNullOrWhiteSpace(body.Timezone) ? "UTC" : body.Timezone.Trim();

    if (b.Mode == "TwentyFourSeven")
    {
      b.Monday = b.Tuesday = b.Wednesday = b.Thursday = b.Friday = b.Saturday = b.Sunday = true;
      b.StartTime = "00:00";
      b.EndTime = "23:59";
    }
    else
    {
      b.Monday = body.Monday;
      b.Tuesday = body.Tuesday;
      b.Wednesday = body.Wednesday;
      b.Thursday = body.Thursday;
      b.Friday = body.Friday;
      b.Saturday = body.Saturday;
      b.Sunday = body.Sunday;
      b.StartTime = string.IsNullOrWhiteSpace(body.StartTime) ? "09:00" : body.StartTime;
      b.EndTime = string.IsNullOrWhiteSpace(body.EndTime) ? "18:00" : body.EndTime;
    }
    return b;
  }

  // ───── Delete ───────────────────────────────────────────

  [HttpDelete("{id:guid}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var b = await _db.BusinessHours.FirstOrDefaultAsync(x => x.Id == id);
    if (b == null) return NotFound();
    if (b.IsDefault) return BadRequest("Default business hours cannot be deleted.");

    // Re-route any groups that pointed at this profile to Default (null).
    var groups = await _db.AgentGroups.Where(g => g.BusinessHoursId == id).ToListAsync();
    foreach (var g in groups) g.BusinessHoursId = null;

    _db.BusinessHours.Remove(b);
    await _db.SaveChangesAsync();
    return NoContent();
  }

  // ───── Holidays ─────────────────────────────────────────

  [HttpPost("{id:guid}/holidays")]
  public async Task<ActionResult<BusinessHoursHolidayDto>> AddHoliday(
      Guid id, [FromBody] BusinessHoursHolidayUpsertDto body)
  {
    var orgId = OrgIdOrThrow();
    var b = await _db.BusinessHours.FirstOrDefaultAsync(x => x.Id == id);
    if (b == null) return NotFound();
    if (string.IsNullOrWhiteSpace(body.Name)) return BadRequest("Name is required.");
    if (!DateOnly.TryParse(body.Date, out var date)) return BadRequest("Invalid date.");

    var h = new BusinessHoursHoliday
    {
      OrganizationId = orgId,
      BusinessHoursId = id,
      Name = body.Name.Trim(),
      Date = date,
      IsRecurring = body.IsRecurring,
    };
    _db.BusinessHoursHolidays.Add(h);
    await _db.SaveChangesAsync();
    return Ok(new BusinessHoursHolidayDto
    {
      Id = h.Id,
      Name = h.Name,
      Date = h.Date.ToString("yyyy-MM-dd"),
      IsRecurring = h.IsRecurring,
    });
  }

  [HttpPut("{id:guid}/holidays/{holidayId:guid}")]
  public async Task<ActionResult<BusinessHoursHolidayDto>> UpdateHoliday(
      Guid id, Guid holidayId, [FromBody] BusinessHoursHolidayUpsertDto body)
  {
    var h = await _db.BusinessHoursHolidays
        .FirstOrDefaultAsync(x => x.Id == holidayId && x.BusinessHoursId == id);
    if (h == null) return NotFound();
    if (!string.IsNullOrWhiteSpace(body.Name)) h.Name = body.Name.Trim();
    if (DateOnly.TryParse(body.Date, out var date)) h.Date = date;
    h.IsRecurring = body.IsRecurring;
    await _db.SaveChangesAsync();
    return Ok(new BusinessHoursHolidayDto
    {
      Id = h.Id,
      Name = h.Name,
      Date = h.Date.ToString("yyyy-MM-dd"),
      IsRecurring = h.IsRecurring,
    });
  }

  [HttpDelete("{id:guid}/holidays/{holidayId:guid}")]
  public async Task<IActionResult> DeleteHoliday(Guid id, Guid holidayId)
  {
    var h = await _db.BusinessHoursHolidays
        .FirstOrDefaultAsync(x => x.Id == holidayId && x.BusinessHoursId == id);
    if (h == null) return NotFound();
    _db.BusinessHoursHolidays.Remove(h);
    await _db.SaveChangesAsync();
    return NoContent();
  }

  // ───── Groups assignment ────────────────────────────────

  [HttpPut("{id:guid}/groups")]
  public async Task<IActionResult> AssignGroups(
      Guid id, [FromBody] BusinessHoursAssignGroupsDto body)
  {
    var orgId = OrgIdOrThrow();
    var b = await _db.BusinessHours.FirstOrDefaultAsync(x => x.Id == id);
    if (b == null) return NotFound();

    var requested = (body.GroupIds ?? new()).ToHashSet();
    var groups = await _db.AgentGroups.ToListAsync();

    foreach (var g in groups)
    {
      var shouldAssign = requested.Contains(g.Id);
      var currentlyAssignedHere = g.BusinessHoursId == id;
      if (shouldAssign && !currentlyAssignedHere)
      {
        g.BusinessHoursId = id;
      }
      else if (!shouldAssign && currentlyAssignedHere)
      {
        g.BusinessHoursId = null;
      }
    }

    await _db.SaveChangesAsync();
    return NoContent();
  }
}
