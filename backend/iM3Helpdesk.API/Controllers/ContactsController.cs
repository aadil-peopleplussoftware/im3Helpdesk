using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ContactsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public ContactsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] string? search = null)
  {
    var query = _context.Contacts.AsQueryable();

    if (!string.IsNullOrEmpty(search))
    {
      var s = search.ToLower();
      query = query.Where(c =>
          c.FullName.ToLower().Contains(s) ||
          c.Email.ToLower().Contains(s) ||
          (c.Company != null &&
           c.Company.ToLower().Contains(s)));
    }

    var contacts = await query
        .OrderByDescending(c => c.CreatedAt)
        .Select(c => new
        {
          c.Id,
          c.FullName,
          c.Email,
          c.PhoneNumber,
          c.Company,
          c.Source,
          c.CreatedAt,
          c.LinkedUserId
        })
        .ToListAsync();

    return Ok(contacts);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var contact = await _context.Contacts
        .FirstOrDefaultAsync(c => c.Id == id);

    if (contact == null) return NotFound();

    // Get ticket count for this contact
    var ticketCount = 0;
    if (contact.LinkedUserId.HasValue)
    {
      ticketCount = await _context.Tickets
          .CountAsync(t =>
              t.CreatedByUserId ==
              contact.LinkedUserId.Value);
    }

    return Ok(new
    {
      contact.Id,
      contact.FullName,
      contact.Email,
      contact.PhoneNumber,
      contact.Company,
      contact.Source,
      contact.CreatedAt,
      contact.LinkedUserId,
      TicketCount = ticketCount
    });
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateContactDto dto)
  {
    var existing = await _context.Contacts
        .FirstOrDefaultAsync(c =>
            c.Email.ToLower() ==
            dto.Email.ToLower());

    if (existing != null)
      return BadRequest(new
      {
        message = "Contact already exists"
      });

    var contact = new iM3Helpdesk.Domain.Entities.Contact
    {
      FullName = dto.FullName,
      Email = dto.Email,
      PhoneNumber = dto.PhoneNumber,
      Company = dto.Company,
      Source = dto.Source ?? "manual",
      OrganizationId =
            _tenantService.OrganizationId!.Value
    };

    _context.Contacts.Add(contact);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Contact created",
      id = contact.Id
    });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> Update(
      Guid id, [FromBody] CreateContactDto dto)
  {
    var contact = await _context.Contacts
        .FirstOrDefaultAsync(c => c.Id == id);

    if (contact == null) return NotFound();

    contact.FullName = dto.FullName;
    contact.PhoneNumber = dto.PhoneNumber;
    contact.Company = dto.Company;

    await _context.SaveChangesAsync();

    return Ok(new { message = "Updated" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var contact = await _context.Contacts
        .FirstOrDefaultAsync(c => c.Id == id);

    if (contact == null) return NotFound();

    _context.Contacts.Remove(contact);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Deleted" });
  }
}

public class CreateContactDto
{
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? PhoneNumber { get; set; }
  public string? Company { get; set; }
  public string? Source { get; set; }
}
