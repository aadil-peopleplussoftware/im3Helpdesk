using iM3Helpdesk.Infrastructure.Persistence;
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

  public SearchController(ApplicationDbContext context)
  {
    _context = context;
  }

  [HttpGet]
  public async Task<IActionResult> GlobalSearch([FromQuery] string q)
  {
    if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
      return Ok(new
      {
        tickets = new List<object>(),
        agents = new List<object>(),
        articles = new List<object>()
      });

    var tickets = await _context.Tickets
        .Include(t => t.CreatedBy)
        .Where(t => t.Title.Contains(q) ||
            t.Description.Contains(q) ||
            t.Category.Contains(q))
        .Take(5)
        .Select(t => new
        {
          t.Id,
          t.Title,
          Status = t.Status.ToString(),
          Type = "ticket"
        })
        .ToListAsync();

    var agents = await _context.Users
        .IgnoreQueryFilters()
        .Where(u => (u.FullName.Contains(q) ||
            u.Email.Contains(q)) &&
            u.OrganizationId != null)
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
        .Where(a => a.IsPublished &&
            (a.Title.Contains(q) ||
            a.Tags.Contains(q)))
        .Take(5)
        .Select(a => new
        {
          a.Id,
          a.Title,
          a.Category,
          Type = "article"
        })
        .ToListAsync();

    return Ok(new { tickets, agents, articles });
  }
}
