using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
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
public class CallLogController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public CallLogController(
      ApplicationDbContext context)
  {
    _context = context;
  }

  private Guid GetUserId()
  {
    var c = User.FindFirst(
        ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(c, out var id);
    return id;
  }

  // ─────────────────────────────────────────
  // GET /api/CallLog
  // ─────────────────────────────────────────
  [HttpGet]
  public async Task<IActionResult> GetCallLogs(
      [FromQuery] string filter = "all",
      [FromQuery] int page = 1,
      [FromQuery] int size = 50)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty)
      return Ok(new List<object>());

    var query = _context.CallLogs
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(c =>
            c.CallerId == myId ||
            c.ReceiverId == myId);

    // Apply filter
    query = filter switch
    {
      "missed" => query.Where(c =>
                      c.ReceiverId == myId &&
                      c.Status == "missed"),
      "incoming" => query.Where(c =>
                      c.ReceiverId == myId &&
                      c.Status != "missed"),
      "outgoing" => query.Where(c =>
                      c.CallerId == myId),
      _ => query
    };

    var rawLogs = await query
        .OrderByDescending(c => c.StartedAt)
        .Skip((page - 1) * size)
        .Take(size)
        .Select(c => new
        {
          c.Id,
          c.CallType,
          c.Status,
          c.DurationSeconds,
          c.StartedAt,
          c.EndedAt,
          c.CallerId,
          c.ReceiverId,
          c.IsRead
        })
        .ToListAsync();

    if (!rawLogs.Any())
      return Ok(new List<object>());

    var userIds = rawLogs
        .SelectMany(l => new[] { l.CallerId, l.ReceiverId })
        .Distinct()
        .ToList();

    // ✅ Customer role wale users filter out — sirf agents/staff dikhenge
    var users = await _context.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u =>
            userIds.Contains(u.Id) &&
            u.Role != UserRole.Customer)
        .Select(u => new
        {
          u.Id,
          u.FullName,
          u.PhotoUrl
        })
        .ToDictionaryAsync(u => u.Id);

    // ✅ Agar otherUser Customer nikla toh wo log skip karo
    var result = rawLogs
        .Select(c =>
        {
          var isOutgoing = c.CallerId == myId;
          var otherId = isOutgoing ? c.ReceiverId : c.CallerId;

          // otherUser Customer hai toh dictionary mein nahi milega — skip
          if (!users.TryGetValue(otherId, out var otherUser))
            return null;

          return (object)new
          {
            c.Id,
            c.CallType,
            c.Status,
            c.DurationSeconds,
            c.StartedAt,
            c.EndedAt,
            c.IsRead,
            IsOutgoing = isOutgoing,
            OtherUserId = otherId,
            OtherUserName = otherUser.FullName,
            OtherUserPhoto = otherUser.PhotoUrl
          };
        })
        .Where(x => x != null)   // null = Customer wale logs hatao
        .ToList();

    return Ok(result);
  }

  // ─────────────────────────────────────────
  // GET /api/CallLog/unread-missed
  // ─────────────────────────────────────────
  [HttpGet("unread-missed")]
  public async Task<IActionResult> GetUnreadMissed()
  {
    var myId = GetUserId();
    if (myId == Guid.Empty)
      return Ok(new { count = 0 });

    // ✅ Sirf non-Customer callers ki missed calls count karo
    var count = await _context.CallLogs
        .AsNoTracking()
        .IgnoreQueryFilters()
        .CountAsync(c =>
            c.ReceiverId == myId &&
            c.Status == "missed" &&
            !c.IsRead &&
            c.Caller.Role != UserRole.Customer);

    return Ok(new { count });
  }

  // ─────────────────────────────────────────
  // POST /api/CallLog/mark-read
  // ─────────────────────────────────────────
  [HttpPost("mark-read")]
  public async Task<IActionResult> MarkAllRead()
  {
    var myId = GetUserId();

    var unread = await _context.CallLogs
        .IgnoreQueryFilters()
        .Where(c =>
            c.ReceiverId == myId &&
            c.Status == "missed" &&
            !c.IsRead)
        .ToListAsync();

    if (unread.Any())
    {
      unread.ForEach(c => c.IsRead = true);
      await _context.SaveChangesAsync();
    }

    return Ok(new { marked = unread.Count, count = 0 });
  }

  // ─────────────────────────────────────────
  // POST /api/CallLog/{id}/read
  // ─────────────────────────────────────────
  [HttpPost("{id}/read")]
  public async Task<IActionResult> MarkOneRead(Guid id)
  {
    var myId = GetUserId();

    var log = await _context.CallLogs
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(c =>
            c.Id == id &&
            c.ReceiverId == myId);

    if (log == null) return NotFound();

    log.IsRead = true;
    await _context.SaveChangesAsync();

    var remaining = await _context.CallLogs
        .AsNoTracking()
        .IgnoreQueryFilters()
        .CountAsync(c =>
            c.ReceiverId == myId &&
            c.Status == "missed" &&
            !c.IsRead &&
            c.Caller.Role != UserRole.Customer);

    return Ok(new { count = remaining });
  }
}
