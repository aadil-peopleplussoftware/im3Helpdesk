using iM3Helpdesk.API.Services;
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
public class CustomerController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly INotificationService _notificationService;
  private readonly IEmailService _emailService;

  public CustomerController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      INotificationService notificationService,
      IEmailService emailService)
  {
    _context = context;
    _tenantService = tenantService;
    _notificationService = notificationService;
    _emailService = emailService;
  }

  [HttpGet("my-tickets")]
  public async Task<IActionResult> GetMyTickets()
  {
    var userId = GetUserId();

    var tickets = await _context.Tickets
        .Include(t => t.AssignedTo)
        .Include(t => t.Comments)
        .Where(t => t.CreatedByUserId == userId)
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.Description,
          t.Category,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          t.CreatedAt,
          t.UpdatedAt,
          t.ResolvedAt,
          AssignedTo = t.AssignedTo != null
                ? t.AssignedTo.FullName : null,
          CommentsCount = t.Comments.Count
        })
        .ToListAsync();

    return Ok(tickets);
  }

  [HttpGet("my-tickets/{id}")]
  public async Task<IActionResult> GetMyTicket(Guid id)
  {
    var userId = GetUserId();

    var ticket = await _context.Tickets
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.Comments)
            .ThenInclude(c => c.User)
        .FirstOrDefaultAsync(t =>
            t.Id == id && t.CreatedByUserId == userId);

    if (ticket == null)
      return NotFound(new { message = "Ticket not found" });

    return Ok(new
    {
      ticket.Id,
      ticket.Title,
      ticket.Description,
      ticket.Category,
      Status = ticket.Status.ToString(),
      Priority = ticket.Priority.ToString(),
      ticket.CreatedAt,
      ticket.UpdatedAt,
      ticket.ResolvedAt,
      assignedTo = ticket.AssignedTo == null ? null : new
      {
        ticket.AssignedTo.FullName
      },
      comments = ticket.Comments
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
              c.Id,
              c.Comment,
              c.CreatedAt,
              user = new { c.User!.FullName },
              isAgent = c.User.Role == UserRole.Agent
                    || c.User.Role == UserRole.CompanyAdmin
            }).ToList()
    });
  }

  [HttpPost("submit-ticket")]
  public async Task<IActionResult> SubmitTicket(
      [FromBody] SubmitTicketDto dto)
  {
    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var ticket = new Ticket
    {
      Title = dto.Title,
      Description = dto.Description,
      Category = dto.Category,
      Priority = TicketPriority.Medium,
      OrganizationId = _tenantService.OrganizationId!.Value,
      CreatedByUserId = userId,
      Status = TicketStatus.Open
    };

    _context.Tickets.Add(ticket);
    await _context.SaveChangesAsync();

    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == userId);

    if (user != null)
    {
      try
      {
        await _emailService.SendAsync(
            user.Email, user.FullName,
            ticket.Title, ticket.Id.ToString());
      }
      catch { }

      await _notificationService.CreateActivityAsync(
          userId, _tenantService.OrganizationId!.Value,
          "Created", $"Customer ticket: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    return Ok(new
    {
      message = "Ticket submitted successfully",
      id = ticket.Id
    });
  }

  [HttpPost("my-tickets/{id}/reply")]
  public async Task<IActionResult> AddReply(Guid id,
      [FromBody] AddReplyDto dto)
  {
    var userId = GetUserId();

    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t =>
            t.Id == id && t.CreatedByUserId == userId);

    if (ticket == null)
      return NotFound(new { message = "Ticket not found" });

    var comment = new TicketComment
    {
      Comment = dto.Reply,
      TicketId = id,
      UserId = userId,
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.TicketComments.Add(comment);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Reply added" });
  }

  private Guid GetUserId()
  {
    var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
  }
}

public class SubmitTicketDto
{
  public string Title { get; set; } = string.Empty;
  public string Description { get; set; } = string.Empty;
  public string Category { get; set; } = "General";
}

public class AddReplyDto
{
  public string Reply { get; set; } = string.Empty;
}
