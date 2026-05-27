using iM3Helpdesk.API.DTOs.Leads;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/leads")]
public class LeadsController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public LeadsController(ApplicationDbContext context)
  {
    _context = context;
  }

  [HttpPost]
  public async Task<IActionResult> CreateLead([FromBody] CreateLeadRequest dto)
  {
    if (!ModelState.IsValid)
      return ValidationProblem(ModelState);

    var lead = new Lead
    {
      OrganizationName = dto.OrganizationName.Trim(),
      OwnerName = dto.OwnerName.Trim(),
      WorkEmail = dto.WorkEmail.Trim().ToLowerInvariant(),
      Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim(),
      Notes = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes.Trim(),
      Status = LeadStatus.Pending,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    _context.Leads.Add(lead);
    await _context.SaveChangesAsync();

    return Accepted(new
    {
      message = "Lead received successfully."
    });
  }
}