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
public class NotificationsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public NotificationsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  private Guid? GetUserId()
  {
    var claim =
        User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    return Guid.TryParse(claim, out var id)
        ? id : null;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] int page = 1,
      [FromQuery] int pageSize = 20)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var notifications = await _context.Notifications
        .Where(n => n.UserId == userId)
        .OrderByDescending(n => n.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(n => new
        {
          n.Id,
          n.Title,
          n.Message,
          n.Type,
          n.IsRead,
          n.CreatedAt,
          n.TicketId
        })
        .ToListAsync();

    return Ok(notifications);
  }

  [HttpGet("unread-count")]
  public async Task<IActionResult> GetUnreadCount()
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var count = await _context.Notifications
        .CountAsync(n =>
            n.UserId == userId && !n.IsRead);

    return Ok(new { count });
  }

  [HttpGet("activity")]
  public async Task<IActionResult> GetActivity(
      [FromQuery] int page = 1,
      [FromQuery] int pageSize = 20)
  {
    var userId = GetUserId();

    var logs = await _context.ActivityLogs
        .AsNoTracking()
        .Where(a => a.UserId == userId)
        .OrderByDescending(a => a.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(a => new
        {
          a.Id,
          a.Action,
          a.Description,
          a.EntityType,
          a.CreatedAt
        })
        .ToListAsync();

    return Ok(logs);
  }

  [HttpPut("{id}/read")]
  public async Task<IActionResult> MarkRead(Guid id)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    try
    {
      var notification = await _context.Notifications
          .FirstOrDefaultAsync(n =>
              n.Id == id &&
              n.UserId == userId);

      if (notification == null)
        return NotFound(new
        {
          message = "Notification not found"
        });

      notification.IsRead = true;
      await _context.SaveChangesAsync();

      return Ok(new { message = "Marked as read" });
    }
    catch (Exception ex)
    {
      return StatusCode(500, new
      {
        message = "Failed",
        error = ex.Message
      });
    }
  }

  [HttpPut("mark-all-read")]
  public async Task<IActionResult> MarkAllRead()
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var unread = await _context.Notifications
        .Where(n =>
            n.UserId == userId && !n.IsRead)
        .ToListAsync();

    unread.ForEach(n => n.IsRead = true);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "All marked as read",
      count = unread.Count
    });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var n = await _context.Notifications
        .FirstOrDefaultAsync(x =>
            x.Id == id && x.UserId == userId);

    if (n == null) return NotFound();

    _context.Notifications.Remove(n);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Deleted" });
  }
}
