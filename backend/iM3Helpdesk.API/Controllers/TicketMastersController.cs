using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketMastersController : ControllerBase
{
  private const string TicketTypeField = "TicketType";
  private const string TicketStatusField = "TicketStatus";
  private const string TicketPriorityField = "TicketPriority";

  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public TicketMastersController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet("all")]
  public async Task<IActionResult> GetAll([FromQuery] bool activeOnly = true)
  {
    await EnsureDefaultsAsync();

    var query = _context.TicketFieldMasters.AsNoTracking();
    if (activeOnly)
      query = query.Where(x => x.IsActive);

    var rows = await query
        .OrderBy(x => x.Field)
        .ThenBy(x => x.SortOrder)
        .ThenBy(x => x.Label)
        .Select(x => new TicketMasterOptionDto
        {
          Id = x.Id,
          Field = x.Field,
          Value = x.Value,
          Label = x.Label,
          SortOrder = x.SortOrder,
          IsActive = x.IsActive
        })
        .ToListAsync();

    return Ok(new
    {
      ticketTypes = rows.Where(x => x.Field == TicketTypeField).ToList(),
      ticketStatuses = rows.Where(x => x.Field == TicketStatusField).ToList(),
      ticketPriorities = rows.Where(x => x.Field == TicketPriorityField).ToList()
    });
  }

  [HttpGet("field/{field}")]
  public async Task<IActionResult> GetByField(string field, [FromQuery] bool activeOnly = true)
  {
    await EnsureDefaultsAsync();

    if (!TryNormalizeField(field, out var normalizedField))
      return BadRequest(new { message = "Invalid field name" });

    var query = _context.TicketFieldMasters
        .AsNoTracking()
        .Where(x => x.Field == normalizedField);

    if (activeOnly)
      query = query.Where(x => x.IsActive);

    var rows = await query
        .OrderBy(x => x.SortOrder)
        .ThenBy(x => x.Label)
        .Select(x => new TicketMasterOptionDto
        {
          Id = x.Id,
          Field = x.Field,
          Value = x.Value,
          Label = x.Label,
          SortOrder = x.SortOrder,
          IsActive = x.IsActive
        })
        .ToListAsync();

    return Ok(rows);
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] CreateTicketMasterOptionDto dto)
  {
    if (!TryNormalizeField(dto.Field, out var field))
      return BadRequest(new { message = "Invalid field" });

    if (!TryNormalizeValue(field, dto.Value, out var value, out var valueError))
      return BadRequest(new { message = valueError });

    var label = string.IsNullOrWhiteSpace(dto.Label) ? value : dto.Label.Trim();

    var exists = await _context.TicketFieldMasters.AnyAsync(x =>
        x.Field == field &&
        x.Value.ToLower() == value.ToLower());

    if (exists)
      return Conflict(new { message = "Option already exists" });

    var row = new TicketFieldMaster
    {
      Field = field,
      Value = value,
      Label = label,
      SortOrder = dto.SortOrder,
      IsActive = true,
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.TicketFieldMasters.Add(row);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Created", id = row.Id });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTicketMasterOptionDto dto)
  {
    var row = await _context.TicketFieldMasters.FirstOrDefaultAsync(x => x.Id == id);
    if (row == null)
      return NotFound(new { message = "Option not found" });

    var field = row.Field;

    if (!string.IsNullOrWhiteSpace(dto.Value))
    {
      var requestedValue = dto.Value.Trim();

      // Legacy rows may contain historic values like numeric enum tokens.
      // If the value is unchanged, allow updating IsActive/Label/SortOrder
      // without forcing re-validation of that legacy value.
      if (!string.Equals(requestedValue, row.Value, StringComparison.OrdinalIgnoreCase))
      {
        if (!TryNormalizeValue(field, requestedValue, out var normalizedValue, out var valueError))
          return BadRequest(new { message = valueError });

        var duplicate = await _context.TicketFieldMasters.AnyAsync(x =>
            x.Id != id &&
            x.Field == field &&
            x.Value.ToLower() == normalizedValue.ToLower());

        if (duplicate)
          return Conflict(new { message = "Option already exists" });

        row.Value = normalizedValue;
      }
    }

    if (!string.IsNullOrWhiteSpace(dto.Label))
      row.Label = dto.Label.Trim();

    if (dto.SortOrder.HasValue)
      row.SortOrder = dto.SortOrder.Value;

    if (dto.IsActive.HasValue)
      row.IsActive = dto.IsActive.Value;

    row.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    return Ok(new { message = "Updated" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var row = await _context.TicketFieldMasters.FirstOrDefaultAsync(x => x.Id == id);
    if (row == null)
      return NotFound(new { message = "Option not found" });

    row.IsActive = false;
    row.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    return Ok(new { message = "Disabled" });
  }

  [HttpDelete("{id}/hard")]
  public async Task<IActionResult> HardDelete(Guid id)
  {
    var row = await _context.TicketFieldMasters.FirstOrDefaultAsync(x => x.Id == id);
    if (row == null)
      return NotFound(new { message = "Option not found" });

    _context.TicketFieldMasters.Remove(row);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Deleted permanently" });
  }

  private async Task EnsureDefaultsAsync()
  {
    var orgId = _tenantService.OrganizationId;
    if (!orgId.HasValue)
      return;

    var defaults = new[]
    {
      new { Field = TicketTypeField, Value = "Support", Label = "Support", SortOrder = 1 },
      new { Field = TicketTypeField, Value = "Question", Label = "Question", SortOrder = 2 },
      new { Field = TicketTypeField, Value = "Incident", Label = "Incident", SortOrder = 3 },
      new { Field = TicketTypeField, Value = "Problem", Label = "Problem", SortOrder = 4 },
      new { Field = TicketTypeField, Value = "Feature Request", Label = "Feature Request", SortOrder = 5 },
      new { Field = TicketTypeField, Value = "Request", Label = "Request", SortOrder = 6 },

      new { Field = TicketStatusField, Value = TicketStatus.Open.ToString(), Label = "Open", SortOrder = 1 },
      new { Field = TicketStatusField, Value = TicketStatus.InProgress.ToString(), Label = "In Progress", SortOrder = 2 },
      new { Field = TicketStatusField, Value = TicketStatus.Pending.ToString(), Label = "Pending", SortOrder = 3 },
      new { Field = TicketStatusField, Value = TicketStatus.Resolved.ToString(), Label = "Resolved", SortOrder = 4 },
      new { Field = TicketStatusField, Value = TicketStatus.ResolvedOnBeta.ToString(), Label = "Resolved On Beta", SortOrder = 5 },
      new { Field = TicketStatusField, Value = TicketStatus.Closed.ToString(), Label = "Closed", SortOrder = 6 },

      new { Field = TicketPriorityField, Value = TicketPriority.Low.ToString(), Label = "Low", SortOrder = 1 },
      new { Field = TicketPriorityField, Value = TicketPriority.Medium.ToString(), Label = "Medium", SortOrder = 2 },
      new { Field = TicketPriorityField, Value = TicketPriority.High.ToString(), Label = "High", SortOrder = 3 },
      new { Field = TicketPriorityField, Value = TicketPriority.Critical.ToString(), Label = "Critical", SortOrder = 4 }
    };

    var existing = await _context.TicketFieldMasters
        .AsNoTracking()
        .Select(x => new { x.Field, x.Value })
        .ToListAsync();

    var existingKeys = new HashSet<string>(existing
        .Select(x => $"{x.Field}|{x.Value}"), StringComparer.OrdinalIgnoreCase);

    var toAdd = defaults
        .Where(d => !existingKeys.Contains($"{d.Field}|{d.Value}"))
        .Select(d => new TicketFieldMaster
        {
          Field = d.Field,
          Value = d.Value,
          Label = d.Label,
          SortOrder = d.SortOrder,
          OrganizationId = orgId.Value,
          IsActive = true
        })
        .ToList();

    if (toAdd.Count == 0)
      return;

    _context.TicketFieldMasters.AddRange(toAdd);
    await _context.SaveChangesAsync();
  }

  private static bool TryNormalizeField(string? input, out string normalizedField)
  {
    normalizedField = string.Empty;
    if (string.IsNullOrWhiteSpace(input))
      return false;

    var value = input.Trim().ToLowerInvariant();
    if (value is "tickettype" or "type")
    {
      normalizedField = TicketTypeField;
      return true;
    }
    if (value is "ticketstatus" or "status")
    {
      normalizedField = TicketStatusField;
      return true;
    }
    if (value is "ticketpriority" or "priority")
    {
      normalizedField = TicketPriorityField;
      return true;
    }
    return false;
  }

  private static bool TryNormalizeValue(
      string field,
      string? input,
      out string normalizedValue,
      out string error)
  {
    normalizedValue = string.Empty;
    error = string.Empty;

    if (string.IsNullOrWhiteSpace(input))
    {
      error = "Value is required";
      return false;
    }

    var value = input.Trim();

    if (field == TicketStatusField)
    {
      if (!TryParseTicketStatus(value, out var status))
      {
        error = "Invalid Ticket Status value. Allowed: Open, InProgress, Pending, Resolved, ResolvedOnBeta, Closed";
        return false;
      }
      normalizedValue = status.ToString();
      return true;
    }

    if (field == TicketPriorityField)
    {
      if (!TryParseTicketPriority(value, out var priority))
      {
        error = "Invalid Ticket Priority value. Allowed: Low, Medium, High, Critical";
        return false;
      }
      normalizedValue = priority.ToString();
      return true;
    }

    normalizedValue = value;
    return true;
  }

  private static bool TryParseTicketStatus(string input, out TicketStatus status)
  {
    if (Enum.TryParse<TicketStatus>(input, true, out status) &&
        Enum.IsDefined(status))
      return true;

    var compact = CompactEnumToken(input);

    if (compact == "close")
    {
      status = TicketStatus.Closed;
      return true;
    }

    foreach (var name in Enum.GetNames<TicketStatus>())
    {
      if (CompactEnumToken(name) == compact)
      {
        status = Enum.Parse<TicketStatus>(name, true);
        return true;
      }
    }

    status = default;
    return false;
  }

  private static bool TryParseTicketPriority(string input, out TicketPriority priority)
  {
    if (Enum.TryParse<TicketPriority>(input, true, out priority) &&
        Enum.IsDefined(priority))
      return true;

    var compact = CompactEnumToken(input);

    if (compact.StartsWith("urgent") ||
        compact.StartsWith("critical") ||
        compact.StartsWith("crit"))
    {
      priority = TicketPriority.Critical;
      return true;
    }

    if (compact.StartsWith("low") || compact == "lo" || compact == "l")
    {
      priority = TicketPriority.Low;
      return true;
    }

    if (compact.StartsWith("medium") || compact.StartsWith("med") || compact == "m")
    {
      priority = TicketPriority.Medium;
      return true;
    }

    if (compact.StartsWith("high") || compact == "hi" || compact == "h")
    {
      priority = TicketPriority.High;
      return true;
    }

    foreach (var name in Enum.GetNames<TicketPriority>())
    {
      if (CompactEnumToken(name) == compact)
      {
        priority = Enum.Parse<TicketPriority>(name, true);
        return true;
      }
    }

    priority = default;
    return false;
  }

  private static string CompactEnumToken(string value)
  {
    var sb = new StringBuilder(value.Length);
    foreach (var ch in value)
    {
      if (char.IsLetterOrDigit(ch))
        sb.Append(char.ToLowerInvariant(ch));
    }

    return sb.ToString();
  }
}

public class TicketMasterOptionDto
{
  public Guid Id { get; set; }
  public string Field { get; set; } = string.Empty;
  public string Value { get; set; } = string.Empty;
  public string Label { get; set; } = string.Empty;
  public int SortOrder { get; set; }
  public bool IsActive { get; set; }
}

public class CreateTicketMasterOptionDto
{
  public string Field { get; set; } = string.Empty;
  public string Value { get; set; } = string.Empty;
  public string? Label { get; set; }
  public int SortOrder { get; set; } = 0;
}

public class UpdateTicketMasterOptionDto
{
  public string? Value { get; set; }
  public string? Label { get; set; }
  public int? SortOrder { get; set; }
  public bool? IsActive { get; set; }
}
