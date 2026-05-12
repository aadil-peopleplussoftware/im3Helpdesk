using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AuditController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public AuditController(
      ApplicationDbContext context)
  {
    _context = context;
  }

  // ✅ GET /api/Audit
  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] int page = 1,
      [FromQuery] int pageSize = 20,
      [FromQuery] string? entityType = null)
  {
    var query = _context.ActivityLogs
        .AsNoTracking()
        .Include(a => a.User)
        .OrderByDescending(a => a.CreatedAt)
        .AsQueryable();

    if (!string.IsNullOrEmpty(entityType))
      query = query.Where(a =>
          a.EntityType == entityType);

    var total = await query.CountAsync();

    var logs = await query
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(a => new
        {
          a.Id,
          a.Action,
          a.Description,
          a.EntityType,
          a.CreatedAt,
          User = a.User != null
                ? a.User.FullName : "System"
        })
        .ToListAsync();

    return Ok(new
    {
      logs,
      total,
      page,
      totalPages = (int)Math.Ceiling(
            (double)total / pageSize)
    });
  }
}
