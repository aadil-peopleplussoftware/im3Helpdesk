using System.Security.Claims;
using iM3Helpdesk.API.Dtos;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

/// <summary>
/// Freshdesk-style SLA Policies admin. Every organisation has exactly one
/// auto-seeded "Default SLA Policy" (cannot be deleted). Custom policies
/// can be added later for specific ticket conditions; the first matching
/// policy (by <see cref="SlaPolicy.Order"/>) wins, falling back to Default.
/// </summary>
[ApiController]
[Route("api/sla-policies")]
[Authorize(Roles = "CompanyAdmin,SuperAdmin")]
public class SlaPoliciesController : ControllerBase
{
  private readonly ApplicationDbContext _db;
  private readonly ICurrentTenantService _tenant;
  private readonly ILogger<SlaPoliciesController> _logger;

  public SlaPoliciesController(
      ApplicationDbContext db,
      ICurrentTenantService tenant,
      ILogger<SlaPoliciesController> logger)
  {
    _db = db;
    _tenant = tenant;
    _logger = logger;
  }

  // ───── helpers ─────────────────────────────────────────────

  private Guid OrgIdOrThrow()
  {
    var id = _tenant.OrganizationId;
    if (id == null || id == Guid.Empty)
      throw new InvalidOperationException("Tenant context missing.");
    return id.Value;
  }

  private Guid? GetUserId()
  {
    var raw = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
              ?? User.FindFirst("sub")?.Value;
    return Guid.TryParse(raw, out var id) ? id : null;
  }

  /// <summary>
  /// Lazy-seed: creates a Freshdesk-style Default policy + business hours
  /// row the first time the admin opens the SLA screen. Idempotent.
  /// </summary>
  private async Task EnsureDefaultsAsync(Guid orgId)
  {
    var hasDefault = await _db.SlaPolicies
        .AnyAsync(p => p.OrganizationId == orgId && p.IsDefault);
    if (!hasDefault)
    {
      var policy = new SlaPolicy
      {
        OrganizationId = orgId,
        Name = "Default SLA Policy",
        Description = "Applies to all tickets when no other policy matches.",
        IsDefault = true,
        IsActive = true,
        Order = 0,
        CreatedByUserId = GetUserId(),
      };

      // Freshdesk default matrix
      policy.Targets.AddRange(new[]
      {
        NewTarget(orgId, TicketPriority.Critical, 30,   240),   // Urgent: 30m / 4h
        NewTarget(orgId, TicketPriority.High,     60,   720),   // 1h / 12h
        NewTarget(orgId, TicketPriority.Medium,   480,  1440),  // 8h / 24h
        NewTarget(orgId, TicketPriority.Low,      1440, 4320),  // 24h / 72h
      });

      _db.SlaPolicies.Add(policy);
      await _db.SaveChangesAsync();
    }

    var hasBh = await _db.BusinessHours
        .AnyAsync(b => b.OrganizationId == orgId);
    if (!hasBh)
    {
      _db.BusinessHours.Add(new BusinessHours { OrganizationId = orgId });
      await _db.SaveChangesAsync();
    }
  }

  private static SlaTarget NewTarget(Guid orgId, TicketPriority p,
      int firstResp, int resolution)
      => new()
      {
        OrganizationId = orgId,
        Priority = p,
        FirstResponseMinutes = firstResp,
        ResolutionMinutes = resolution,
        OperationalHours = "BusinessHours",
        EscalationEnabled = true,
      };

  // ───── list ────────────────────────────────────────────────

  /// <summary>List of policies (ordered, default first).</summary>
  [HttpGet]
  public async Task<ActionResult<List<SlaPolicyListItemDto>>> List()
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultsAsync(orgId);

    var rows = await _db.SlaPolicies
        .AsNoTracking()
        .OrderByDescending(p => p.IsDefault)
        .ThenBy(p => p.Order)
        .ThenBy(p => p.CreatedAt)
        .Select(p => new SlaPolicyListItemDto
        {
          Id = p.Id,
          Name = p.Name,
          Description = p.Description,
          IsDefault = p.IsDefault,
          IsActive = p.IsActive,
          Order = p.Order,
        })
        .ToListAsync();

    return Ok(rows);
  }

  // ───── detail ──────────────────────────────────────────────

  [HttpGet("{id:guid}")]
  public async Task<ActionResult<SlaPolicyDetailDto>> Get(Guid id)
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultsAsync(orgId);

    var p = await _db.SlaPolicies
        .AsNoTracking()
        .Include(x => x.Targets)
        .Include(x => x.Reminders)
        .Include(x => x.Escalations)
        .FirstOrDefaultAsync(x => x.Id == id);
    if (p == null) return NotFound();

    return Ok(ToDetail(p));
  }

  private static SlaPolicyDetailDto ToDetail(SlaPolicy p) => new()
  {
    Id = p.Id,
    Name = p.Name,
    Description = p.Description,
    IsDefault = p.IsDefault,
    IsActive = p.IsActive,
    Order = p.Order,
    Targets = p.Targets
      .OrderBy(t => (int)t.Priority)
      .Select(t => new SlaTargetDto
      {
        Id = t.Id,
        Priority = t.Priority,
        FirstResponseMinutes = t.FirstResponseMinutes,
        ResolutionMinutes = t.ResolutionMinutes,
        OperationalHours = t.OperationalHours,
        EscalationEnabled = t.EscalationEnabled,
      }).ToList(),
    Reminders = p.Reminders.Select(r => new SlaReminderDto
    {
      Id = r.Id,
      TargetType = r.TargetType,
      ApproachInMinutes = r.ApproachInMinutes,
      Recipients = r.Recipients,
    }).ToList(),
    Escalations = p.Escalations.Select(es => new SlaEscalationDto
    {
      Id = es.Id,
      TargetType = es.TargetType,
      EscalateAfterMinutes = es.EscalateAfterMinutes,
      Recipients = es.Recipients,
    }).ToList(),
  };

  // ───── create ──────────────────────────────────────────────

  [HttpPost]
  public async Task<ActionResult<SlaPolicyDetailDto>> Create(
      [FromBody] SlaPolicyUpsertDto body)
  {
    var orgId = OrgIdOrThrow();
    if (string.IsNullOrWhiteSpace(body.Name))
      return BadRequest("Name is required.");

    var nextOrder = await _db.SlaPolicies
        .Where(p => p.OrganizationId == orgId)
        .Select(p => (int?)p.Order).MaxAsync() ?? 0;

    var p = new SlaPolicy
    {
      OrganizationId = orgId,
      Name = body.Name.Trim(),
      Description = body.Description?.Trim(),
      IsDefault = false,
      IsActive = body.IsActive,
      Order = nextOrder + 1,
      CreatedByUserId = GetUserId(),
    };
    ApplyChildren(p, body, orgId);

    _db.SlaPolicies.Add(p);
    await _db.SaveChangesAsync();
    return Ok(ToDetail(p));
  }

  // ───── update ──────────────────────────────────────────────

  [HttpPut("{id:guid}")]
  public async Task<ActionResult<SlaPolicyDetailDto>> Update(
      Guid id, [FromBody] SlaPolicyUpsertDto body)
  {
    try
    {
      var orgId = OrgIdOrThrow();
      var existing = await _db.SlaPolicies
          .AsNoTracking()
          .FirstOrDefaultAsync(x => x.Id == id);
      if (existing == null) return NotFound();

      var newName = existing.IsDefault
          ? existing.Name
          : (string.IsNullOrWhiteSpace(body.Name) ? existing.Name : body.Name.Trim());
      var newDesc = body.Description?.Trim();
      var newActive = body.IsActive;
      var now = DateTime.UtcNow;

      // 1. Parent update — bulk, no tracker.
      var rows = await _db.SlaPolicies
          .Where(x => x.Id == id)
          .ExecuteUpdateAsync(s => s
              .SetProperty(x => x.Name, newName)
              .SetProperty(x => x.Description, newDesc)
              .SetProperty(x => x.IsActive, newActive)
              .SetProperty(x => x.UpdatedAt, now));
      if (rows == 0) return NotFound();

      // 2. Wipe children — bulk, no tracker.
      await _db.SlaTargets.Where(t => t.SlaPolicyId == id).ExecuteDeleteAsync();
      await _db.SlaReminders.Where(r => r.SlaPolicyId == id).ExecuteDeleteAsync();
      await _db.SlaEscalations.Where(e => e.SlaPolicyId == id).ExecuteDeleteAsync();

      // 3. Insert fresh children — only Added entries in tracker.
      foreach (var t in body.Targets)
      {
        _db.SlaTargets.Add(new SlaTarget
        {
          OrganizationId = orgId,
          SlaPolicyId = id,
          Priority = t.Priority,
          FirstResponseMinutes = Math.Max(1, t.FirstResponseMinutes),
          ResolutionMinutes = Math.Max(1, t.ResolutionMinutes),
          OperationalHours = string.IsNullOrWhiteSpace(t.OperationalHours)
              ? "BusinessHours" : t.OperationalHours,
          EscalationEnabled = t.EscalationEnabled,
        });
      }
      foreach (var r in body.Reminders)
      {
        _db.SlaReminders.Add(new SlaReminder
        {
          OrganizationId = orgId,
          SlaPolicyId = id,
          TargetType = string.IsNullOrWhiteSpace(r.TargetType) ? "FirstResponse" : r.TargetType,
          ApproachInMinutes = Math.Max(1, r.ApproachInMinutes),
          Recipients = r.Recipients ?? "AssignedAgent",
        });
      }
      foreach (var es in body.Escalations)
      {
        _db.SlaEscalations.Add(new SlaEscalation
        {
          OrganizationId = orgId,
          SlaPolicyId = id,
          TargetType = string.IsNullOrWhiteSpace(es.TargetType) ? "FirstResponse" : es.TargetType,
          EscalateAfterMinutes = Math.Max(0, es.EscalateAfterMinutes),
          Recipients = es.Recipients ?? "AssignedAgent",
        });
      }
      await _db.SaveChangesAsync();

      var fresh = await _db.SlaPolicies
          .AsNoTracking()
          .Include(x => x.Targets)
          .Include(x => x.Reminders)
          .Include(x => x.Escalations)
          .FirstAsync(x => x.Id == id);
      return Ok(ToDetail(fresh));
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "SLA policy update failed for id {Id}", id);
      return StatusCode(500, new { message = ex.Message, detail = ex.InnerException?.Message });
    }
  }

  private static void ApplyChildren(SlaPolicy p, SlaPolicyUpsertDto body, Guid orgId)
  {
    foreach (var t in body.Targets)
    {
      p.Targets.Add(new SlaTarget
      {
        OrganizationId = orgId,
        Priority = t.Priority,
        FirstResponseMinutes = Math.Max(1, t.FirstResponseMinutes),
        ResolutionMinutes = Math.Max(1, t.ResolutionMinutes),
        OperationalHours = string.IsNullOrWhiteSpace(t.OperationalHours)
            ? "BusinessHours" : t.OperationalHours,
        EscalationEnabled = t.EscalationEnabled,
      });
    }
    foreach (var r in body.Reminders)
    {
      p.Reminders.Add(new SlaReminder
      {
        OrganizationId = orgId,
        TargetType = string.IsNullOrWhiteSpace(r.TargetType) ? "FirstResponse" : r.TargetType,
        ApproachInMinutes = Math.Max(1, r.ApproachInMinutes),
        Recipients = r.Recipients ?? "AssignedAgent",
      });
    }
    foreach (var es in body.Escalations)
    {
      p.Escalations.Add(new SlaEscalation
      {
        OrganizationId = orgId,
        TargetType = string.IsNullOrWhiteSpace(es.TargetType) ? "FirstResponse" : es.TargetType,
        EscalateAfterMinutes = Math.Max(0, es.EscalateAfterMinutes),
        Recipients = es.Recipients ?? "AssignedAgent",
      });
    }
  }

  // ───── delete / toggle ─────────────────────────────────────

  [HttpDelete("{id:guid}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var p = await _db.SlaPolicies.FirstOrDefaultAsync(x => x.Id == id);
    if (p == null) return NotFound();
    if (p.IsDefault) return BadRequest("Default SLA policy cannot be deleted.");

    _db.SlaPolicies.Remove(p);
    await _db.SaveChangesAsync();
    return NoContent();
  }

  public class TogglePayload { public bool IsActive { get; set; } }

  [HttpPost("{id:guid}/toggle")]
  public async Task<IActionResult> Toggle(Guid id, [FromBody] TogglePayload body)
  {
    var p = await _db.SlaPolicies.FirstOrDefaultAsync(x => x.Id == id);
    if (p == null) return NotFound();
    p.IsActive = body.IsActive;
    p.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync();
    return Ok(new { p.Id, p.IsActive });
  }

  // ───── business hours ──────────────────────────────────────

  [HttpGet("business-hours")]
  public async Task<ActionResult<BusinessHoursDto>> GetBusinessHours()
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultsAsync(orgId);

    var bh = await _db.BusinessHours
        .AsNoTracking()
        .FirstAsync(b => b.OrganizationId == orgId);
    return Ok(new BusinessHoursDto
    {
      Monday = bh.Monday,
      Tuesday = bh.Tuesday,
      Wednesday = bh.Wednesday,
      Thursday = bh.Thursday,
      Friday = bh.Friday,
      Saturday = bh.Saturday,
      Sunday = bh.Sunday,
      StartTime = bh.StartTime,
      EndTime = bh.EndTime,
      Timezone = bh.Timezone,
    });
  }

  [HttpPut("business-hours")]
  public async Task<ActionResult<BusinessHoursDto>> UpdateBusinessHours(
      [FromBody] BusinessHoursDto body)
  {
    var orgId = OrgIdOrThrow();
    await EnsureDefaultsAsync(orgId);

    var bh = await _db.BusinessHours
        .FirstAsync(b => b.OrganizationId == orgId);
    bh.Monday = body.Monday;
    bh.Tuesday = body.Tuesday;
    bh.Wednesday = body.Wednesday;
    bh.Thursday = body.Thursday;
    bh.Friday = body.Friday;
    bh.Saturday = body.Saturday;
    bh.Sunday = body.Sunday;
    bh.StartTime = string.IsNullOrWhiteSpace(body.StartTime) ? "09:00" : body.StartTime;
    bh.EndTime = string.IsNullOrWhiteSpace(body.EndTime) ? "18:00" : body.EndTime;
    bh.Timezone = string.IsNullOrWhiteSpace(body.Timezone) ? "UTC" : body.Timezone;
    bh.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync();
    return Ok(body);
  }
}
