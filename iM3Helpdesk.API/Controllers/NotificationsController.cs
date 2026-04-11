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

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var userId = GetUserId();

    var dbNotifications = await _context.Notifications
        .Where(n => n.UserId == userId)
        .OrderByDescending(n => n.CreatedAt)
        .Take(50)
        .Select(n => new
        {
          n.Id,
          n.Title,
          n.Message,
          n.Type,
          n.IsRead,
          n.TicketId,
          n.CreatedAt
        })
        .ToListAsync();

    var notifications = dbNotifications.Select(n => new
    {
      n.Id,
      n.Title,
      n.Message,
      n.Type,
      n.IsRead,
      n.TicketId,
      n.CreatedAt,
      timeAgo = GetTimeAgo(n.CreatedAt)
    });

    return Ok(notifications);
  }

  [HttpGet("unread-count")]
  public async Task<IActionResult> GetUnreadCount()
  {
    var userId = GetUserId();
    var count = await _context.Notifications
        .CountAsync(n => n.UserId == userId && !n.IsRead);
    return Ok(new { count });
  }

  [HttpPut("{id}/read")]
  public async Task<IActionResult> MarkRead(Guid id)
  {
    var notification = await _context.Notifications
        .FirstOrDefaultAsync(n => n.Id == id);

    if (notification == null) return NotFound();

    notification.IsRead = true;
    await _context.SaveChangesAsync();
    return Ok(new { message = "Marked as read" });
  }

  [HttpPut("mark-all-read")]
  public async Task<IActionResult> MarkAllRead()
  {
    var userId = GetUserId();
    var notifications = await _context.Notifications
        .Where(n => n.UserId == userId && !n.IsRead)
        .ToListAsync();

    notifications.ForEach(n => n.IsRead = true);
    await _context.SaveChangesAsync();
    return Ok(new { message = "All marked as read" });
  }

  [HttpGet("activity")]
  public async Task<IActionResult> GetActivity()
  {
    var logs = await _context.ActivityLogs
        .Include(a => a.User)
        .OrderByDescending(a => a.CreatedAt)
        .Take(50)
        .Select(a => new
        {
          a.Id,
          a.Action,
          a.Description,
          a.EntityType,
          a.EntityId,
          a.CreatedAt,
          user = a.User == null ? null : new { a.User.FullName }
        })
        .ToListAsync();

    return Ok(logs);
  }

  private Guid GetUserId()
  {
    var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
  }

  private static string GetTimeAgo(DateTime createdAt)
  {
    var diff = DateTime.UtcNow - createdAt;
    if (diff.TotalMinutes < 1) return "just now";
    if (diff.TotalMinutes < 60) return $"{(int)diff.TotalMinutes}m ago";
    if (diff.TotalHours < 24) return $"{(int)diff.TotalHours}h ago";
    return $"{(int)diff.TotalDays}d ago";
  }
}
