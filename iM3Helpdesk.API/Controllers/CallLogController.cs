using iM3Helpdesk.Infrastructure.Persistence;
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
  [HttpGet]
  public async Task<IActionResult>
      GetHistory(
          [FromQuery] string filter = "all",
          [FromQuery] int page = 1,
          [FromQuery] int size = 100)
  {
    var myId = GetUserId();

    var query = _context.CallLogs
        .Where(c =>
            c.CallerId == myId ||
            c.ReceiverId == myId)
        .AsQueryable();

    query = filter switch
    {
      "missed" => query.Where(c =>
          c.ReceiverId == myId &&
          c.Status == "missed"),
      "incoming" => query.Where(c =>
          c.ReceiverId == myId),
      "outgoing" => query.Where(c =>
          c.CallerId == myId),
      _ => query
    };

    var total = await query.CountAsync();

    var logs = await query
        .OrderByDescending(c => c.StartedAt)
        .Skip((page - 1) * size)
        .Take(size)
        .Include(c => c.Caller)
        .Include(c => c.Receiver)
        .Select(c => new
        {
          c.Id,
          c.CallType,
          c.Status,
          c.DurationSeconds,
          c.StartedAt,
          c.EndedAt,
          IsOutgoing = c.CallerId == myId,
          OtherUser = c.CallerId == myId
              ? new
              {
                Id = c.Receiver.Id,
                Name = c.Receiver.FullName,
                Email = c.Receiver.Email,
                Photo = c.Receiver.PhotoUrl
              }
              : new
              {
                Id = c.Caller.Id,
                Name = c.Caller.FullName,
                Email = c.Caller.Email,
                Photo = c.Caller.PhotoUrl
              }
        })
        .ToListAsync();

    return Ok(new
    {
      total,
      page,
      size,
      data = logs
    });
  }
  [HttpGet("unread-missed")]
  public async Task<IActionResult>
      UnreadMissed()
  {
    var myId = GetUserId();
    var count = await _context.CallLogs
        .CountAsync(c =>
            c.ReceiverId == myId &&
            c.Status == "missed");
    return Ok(new { count });
  }
}
