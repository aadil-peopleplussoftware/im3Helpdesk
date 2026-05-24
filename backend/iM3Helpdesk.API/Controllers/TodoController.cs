using iM3Helpdesk.Domain.Entities;
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
public class TodoController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;

  public TodoController(
      ApplicationDbContext context,
      ICurrentTenantService tenant)
  {
    _context = context;
    _tenant = tenant;
  }

  private Guid GetUserId()
  {
    var claim =
        User.FindFirst(
            ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(claim, out var id);
    return id;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var userId = GetUserId();
    if (userId == Guid.Empty)
      return Unauthorized();

    var orgId = _tenant.OrganizationId;
    if (!orgId.HasValue)
    {
      if (_tenant.IsSuperAdmin)
        return Ok(Array.Empty<object>());

      return Unauthorized(new
      {
        message = "Organization context is missing"
      });
    }

    var todos = await _context.TodoItems
        .AsNoTracking()
        .Where(t =>
            t.UserId == userId &&
            t.OrganizationId == orgId.Value)
        .OrderBy(t => t.IsCompleted)
        .ThenByDescending(t => t.CreatedAt)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.TicketNumber,
          t.TicketId,
          t.IsCompleted,
          t.CreatedAt,
          t.CompletedAt
        })
        .ToListAsync();

    return Ok(todos);
  }

  [HttpGet("unread-count")]
  public async Task<IActionResult> GetUnreadCount()
  {
    var userId = GetUserId();
    if (userId == Guid.Empty)
      return Unauthorized();

    var orgId = _tenant.OrganizationId;
    if (!orgId.HasValue)
    {
      if (_tenant.IsSuperAdmin)
        return Ok(new { count = 0 });

      return Unauthorized(new
      {
        message = "Organization context is missing"
      });
    }

    var count = await _context.TodoItems
        .AsNoTracking()
        .CountAsync(t =>
            t.UserId == userId &&
            t.OrganizationId == orgId.Value &&
            !t.IsCompleted);

    return Ok(new { count });
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateTodoDto dto)
  {
    var userId = GetUserId();
    if (userId == Guid.Empty)
      return Unauthorized();

    if (string.IsNullOrEmpty(dto.Title))
      return BadRequest(new
      {
        message = "Title required"
      });

    var orgId = _tenant.OrganizationId;
    if (!orgId.HasValue)
    {
      return Unauthorized(new
      {
        message = "Organization context is missing"
      });
    }

    var todo = new TodoItem
    {
      Title = dto.Title.Trim(),
      TicketNumber = dto.TicketNumber,
      TicketId = dto.TicketId,
      UserId = userId,
      OrganizationId = orgId.Value
    };

    _context.TodoItems.Add(todo);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      todo.Id,
      todo.Title,
      todo.TicketNumber,
      todo.TicketId,
      todo.IsCompleted,
      todo.CreatedAt
    });
  }

  [HttpPut("{id}/toggle")]
  public async Task<IActionResult> Toggle(Guid id)
  {
    var userId = GetUserId();

    var todo = await _context.TodoItems
        .FirstOrDefaultAsync(t =>
            t.Id == id &&
            t.UserId == userId);

    if (todo == null) return NotFound();

    todo.IsCompleted = !todo.IsCompleted;
    todo.CompletedAt = todo.IsCompleted
        ? DateTime.UtcNow : null;

    await _context.SaveChangesAsync();
    return Ok(new
    {
      isCompleted = todo.IsCompleted
    });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var userId = GetUserId();

    var todo = await _context.TodoItems
        .FirstOrDefaultAsync(t =>
            t.Id == id &&
            t.UserId == userId);

    if (todo == null) return NotFound();

    _context.TodoItems.Remove(todo);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Deleted" });
  }
}

public class CreateTodoDto
{
  public string Title { get; set; } = "";
  public string? TicketNumber { get; set; }
  public Guid? TicketId { get; set; }
}
