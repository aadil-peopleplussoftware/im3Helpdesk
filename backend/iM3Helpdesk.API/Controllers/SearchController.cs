using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using iM3Helpdesk.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SearchController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;

  public SearchController(
      ApplicationDbContext context,
      ICurrentTenantService tenant)
  {
    _context = context;
    _tenant = tenant;
  }

  [HttpGet]
  [Authorize(Roles = nameof(UserRole.SuperAdmin) + "," + nameof(UserRole.CompanyAdmin) + "," + nameof(UserRole.Agent))]
  public async Task<IActionResult> GlobalSearch([FromQuery] string q)
  {
    if (!_tenant.OrganizationId.HasValue)
      return Forbid();

    var orgId = _tenant.OrganizationId.Value;

    var query = (q ?? string.Empty).Trim();
    var ql = query.ToLower();

    if (string.IsNullOrWhiteSpace(query) || query.Length < 2)
      return Ok(new
      {
        tickets = new List<object>(),
        contacts = new List<object>(),
        users = new List<object>(),
        agents = new List<object>(),
        articles = new List<object>()
      });

    var digits = new string(query.Where(char.IsDigit).ToArray());
    var hasTicketNo = int.TryParse(digits, out var ticketNo);
    var hasTicketId = Guid.TryParse(query, out var ticketId);

    var tickets = await _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Where(t => t.OrganizationId == orgId)
        .Where(t =>
            t.Title.ToLower().Contains(ql) ||
            t.Description.ToLower().Contains(ql) ||
            t.Category.ToLower().Contains(ql) ||
            t.Tags.ToLower().Contains(ql) ||
            (t.CreatedBy != null &&
              (t.CreatedBy.FullName.ToLower().Contains(ql) ||
               t.CreatedBy.Email.ToLower().Contains(ql))) ||
            (t.AssignedTo != null &&
              (t.AssignedTo.FullName.ToLower().Contains(ql) ||
               t.AssignedTo.Email.ToLower().Contains(ql))) ||
            (hasTicketNo && t.TicketNumber == ticketNo) ||
            (hasTicketId && t.Id == ticketId))
        .Take(5)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.TicketNumber,
          Status = t.Status.ToString(),
          Type = "ticket"
        })
        .ToListAsync();

    var contacts = await _context.Contacts
        .AsNoTracking()
        .Where(c => c.OrganizationId == orgId &&
          (c.FullName.ToLower().Contains(ql) ||
           c.Email.ToLower().Contains(ql) ||
           (c.Company != null && c.Company.ToLower().Contains(ql))))
        .Take(5)
        .Select(c => new
        {
          c.Id,
          Name = c.FullName,
          c.Email,
          c.Company,
          Type = "contact"
        })
        .ToListAsync();

    // Users = all org users (agents + customers, excluding SuperAdmin)
    var users = await _context.Users
        .AsNoTracking()
        .Where(u =>
          u.OrganizationId == orgId &&
          u.Role != UserRole.SuperAdmin &&
          (u.FullName.ToLower().Contains(ql) ||
           u.Email.ToLower().Contains(ql)))
        .Take(5)
        .Select(u => new
        {
          u.Id,
          Name = u.FullName,
          u.Email,
          Role = u.Role.ToString(),
          Type = "user"
        })
        .ToListAsync();

    var agents = await _context.Users
        .AsNoTracking()
        .Where(u => (u.FullName.ToLower().Contains(ql) ||
            u.Email.ToLower().Contains(ql)) &&
        u.OrganizationId == orgId &&
        (u.Role == UserRole.Agent ||
         u.Role == UserRole.CompanyAdmin))
        .Take(5)
        .Select(u => new
        {
          u.Id,
          Name = u.FullName,
          u.Email,
          Type = "agent"
        })
        .ToListAsync();

    var articles = await _context.KbArticles
        .AsNoTracking()
        .Where(a => a.OrganizationId == orgId && a.IsPublished &&
            (a.Title.ToLower().Contains(ql) ||
            a.Tags.ToLower().Contains(ql) ||
            a.Category.ToLower().Contains(ql)))
        .Take(5)
        .Select(a => new
        {
          a.Id,
          a.Title,
          a.Category,
          Type = "article"
        })
        .ToListAsync();

    return Ok(new { tickets, contacts, users, agents, articles });
  }
}
