using iM3Helpdesk.API.Middleware;
using iM3Helpdesk.API.Services;
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
public class TicketTemplatesController : ControllerBase
{
  private const string TicketTypeField = "TicketType";
  private const string TicketStatusField = "TicketStatus";
  private const string TicketPriorityField = "TicketPriority";

  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public TicketTemplatesController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  private async Task<bool> IsMasterValueAllowedAsync(
      string field,
      string value)
  {
    var hasRows = await _context.TicketFieldMasters
        .AnyAsync(x => x.Field == field);

    if (!hasRows)
      return true;

    return await _context.TicketFieldMasters
        .AnyAsync(x =>
            x.Field == field &&
            x.IsActive &&
            x.Value == value);
  }

  private static bool TryParseTicketStatus(string? input, out TicketStatus status)
  {
    status = default;
    if (string.IsNullOrWhiteSpace(input))
      return false;

    var value = input.Trim();

    if (Enum.TryParse<TicketStatus>(value, true, out var parsed) &&
        Enum.IsDefined(parsed))
    {
      status = parsed;
      return true;
    }

    var compact = CompactEnumToken(value);
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

    return false;
  }

  private static bool TryParseTicketPriority(string? input, out TicketPriority priority)
  {
    priority = default;
    if (string.IsNullOrWhiteSpace(input))
      return false;

    var value = input.Trim();

    if (Enum.TryParse<TicketPriority>(value, true, out var parsed) &&
        Enum.IsDefined(parsed))
    {
      priority = parsed;
      return true;
    }

    var compact = CompactEnumToken(value);
    if (compact == "urgent")
    {
      priority = TicketPriority.Critical;
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

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var templates = await _context.TicketTemplates
        .OrderBy(t => t.Name)
        .ToListAsync();
    return Ok(templates);
  }

  [HttpPost]
  [RequirePermission("ticket-templates", PermissionAction.Add)]
  public async Task<IActionResult> Create([FromBody] TicketTemplateDto dto)
  {
    var priority = dto.Priority?.Trim() ?? TicketPriority.Medium.ToString();
    var status = dto.Status?.Trim() ?? TicketStatus.Open.ToString();
    var ticketType = dto.TicketType?.Trim() ?? "Support";

    if (!TryParseTicketPriority(priority, out var parsedPriority))
      return BadRequest(new { message = "Invalid template priority" });

    if (!TryParseTicketStatus(status, out var parsedStatus))
      return BadRequest(new { message = "Invalid template status" });

    if (!await IsMasterValueAllowedAsync(TicketPriorityField, parsedPriority.ToString()))
      return BadRequest(new { message = $"Priority {parsedPriority} is not active in ticket master" });

    if (!await IsMasterValueAllowedAsync(TicketStatusField, parsedStatus.ToString()))
      return BadRequest(new { message = $"Status {parsedStatus} is not active in ticket master" });

    if (!await IsMasterValueAllowedAsync(TicketTypeField, ticketType))
      return BadRequest(new { message = $"Ticket Type {ticketType} is not active in ticket master" });

    var template = new TicketTemplate
    {
      Name = dto.Name,
      Title = dto.Title,
      Description = dto.Description,
      Category = dto.Category,
      Priority = parsedPriority.ToString(),
      Status = parsedStatus.ToString(),
      TicketType = ticketType,
      Tags = dto.Tags,
      OrganizationId = _tenantService.OrganizationId!.Value
    };
    _context.TicketTemplates.Add(template);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Template created", id = template.Id });
  }

  [HttpDelete("{id}")]
  [RequirePermission("ticket-templates", PermissionAction.Delete)]
  public async Task<IActionResult> Delete(Guid id)
  {
    var template = await _context.TicketTemplates.FindAsync(id);
    if (template == null) return NotFound();
    _context.TicketTemplates.Remove(template);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Template deleted" });
  }
}

public class TicketTemplateDto
{
  public string Name { get; set; } = string.Empty;
  public string Title { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
  public string Category { get; set; } = "General";
  public string Priority { get; set; } = "Medium";
  public string TicketType { get; set; } = "Support";
  public string Status { get; set; } = "Open";
  public string? Tags { get; set; }
}
