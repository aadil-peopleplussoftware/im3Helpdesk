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
public class CustomFieldsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public CustomFieldsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var fields = await _context.CustomFields
        .Where(f => f.IsActive)
        .OrderBy(f => f.SortOrder)
        .Select(f => new
        {
          f.Id,
          f.Label,
          f.FieldType,
          f.Options,
          f.IsRequired,
          f.SortOrder
        })
        .ToListAsync();

    return Ok(fields);
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateCustomFieldDto dto)
  {
    var field = new CustomField
    {
      Label = dto.Label,
      FieldType = dto.FieldType,
      Options = dto.Options,
      IsRequired = dto.IsRequired,
      SortOrder = dto.SortOrder,
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Custom field created", id = field.Id });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> Update(Guid id,
      [FromBody] CreateCustomFieldDto dto)
  {
    var field = await _context.CustomFields.FindAsync(id);
    if (field == null) return NotFound();

    field.Label = dto.Label;
    field.FieldType = dto.FieldType;
    field.Options = dto.Options;
    field.IsRequired = dto.IsRequired;
    field.SortOrder = dto.SortOrder;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Updated" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var field = await _context.CustomFields.FindAsync(id);
    if (field == null) return NotFound();

    field.IsActive = false;
    await _context.SaveChangesAsync();
    return Ok(new { message = "Deleted" });
  }

  [HttpPost("ticket/{ticketId}/values")]
  public async Task<IActionResult> SaveValues(Guid ticketId,
      [FromBody] List<FieldValueDto> values)
  {
    var existing = await _context.TicketCustomFieldValues
        .Where(v => v.TicketId == ticketId)
        .ToListAsync();

    _context.TicketCustomFieldValues.RemoveRange(existing);

    foreach (var v in values)
    {
      if (!string.IsNullOrEmpty(v.Value))
      {
        _context.TicketCustomFieldValues.Add(
            new TicketCustomFieldValue
            {
              TicketId = ticketId,
              CustomFieldId = v.CustomFieldId,
              Value = v.Value,
              OrganizationId = _tenantService.OrganizationId!.Value
            });
      }
    }

    await _context.SaveChangesAsync();
    return Ok(new { message = "Values saved" });
  }

  [HttpGet("ticket/{ticketId}/values")]
  public async Task<IActionResult> GetValues(Guid ticketId)
  {
    var values = await _context.TicketCustomFieldValues
        .Include(v => v.CustomField)
        .Where(v => v.TicketId == ticketId)
        .Select(v => new
        {
          v.CustomFieldId,
          v.Value,
          Label = v.CustomField!.Label,
          FieldType = v.CustomField.FieldType
        })
        .ToListAsync();

    return Ok(values);
  }
}

public class CreateCustomFieldDto
{
  public string Label { get; set; } = string.Empty;
  public string FieldType { get; set; } = "text";
  public string? Options { get; set; }
  public bool IsRequired { get; set; } = false;
  public int SortOrder { get; set; } = 0;
}

public class FieldValueDto
{
  public Guid CustomFieldId { get; set; }
  public string Value { get; set; } = string.Empty;
}
