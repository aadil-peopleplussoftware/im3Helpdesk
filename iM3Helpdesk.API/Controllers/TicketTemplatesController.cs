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
public class TicketTemplatesController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public TicketTemplatesController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
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
  public async Task<IActionResult> Create([FromBody] TicketTemplateDto dto)
  {
    var template = new TicketTemplate
    {
      Name = dto.Name,
      Title = dto.Title,
      Description = dto.Description,
      Category = dto.Category,
      Priority = dto.Priority,
      OrganizationId = _tenantService.OrganizationId!.Value
    };
    _context.TicketTemplates.Add(template);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Template created", id = template.Id });
  }

  [HttpDelete("{id}")]
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
