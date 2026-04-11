using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InboundEmailController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public InboundEmailController(ApplicationDbContext context)
  {
    _context = context;
  }

  [HttpPost]
  public async Task<IActionResult> ReceiveEmail(
      [FromBody] InboundEmailDto dto)
  {
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.SupportEmail == dto.ToEmail && o.IsActive);

    if (org == null)
      return BadRequest(new { message = "Organization not found" });

    var sender = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email == dto.FromEmail &&
            u.OrganizationId == org.Id);

    if (sender == null)
    {
      sender = new User
      {
        FullName = dto.FromName ?? dto.FromEmail.Split('@')[0],
        Email = dto.FromEmail,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(
              Guid.NewGuid().ToString()),
        Role = UserRole.Customer,
        OrganizationId = org.Id,
        IsEmailVerified = true
      };
      _context.Users.Add(sender);
      await _context.SaveChangesAsync();
    }

    var ticket = new Ticket
    {
      Title = dto.Subject ?? "No Subject",
      Description = dto.Body ?? "",
      Category = "General",
      Priority = TicketPriority.Medium,
      Status = TicketStatus.Open,
      OrganizationId = org.Id,
      CreatedByUserId = sender.Id,
      Tags = "email"
    };

    _context.Tickets.Add(ticket);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Ticket created from email",
      ticketId = ticket.Id
    });
  }
}

public class InboundEmailDto
{
  public string FromEmail { get; set; } = string.Empty;
  public string? FromName { get; set; }
  public string ToEmail { get; set; } = string.Empty;
  public string? Subject { get; set; }
  public string? Body { get; set; }
}
