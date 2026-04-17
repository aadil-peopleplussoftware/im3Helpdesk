using iM3Helpdesk.API.DTOs.Tickets;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly INotificationService _notificationService;
  private readonly IEmailService _emailService;
  private readonly ISlaService _slaService;
  private readonly ILogger<TicketsController> _logger;

  public TicketsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      INotificationService notificationService,
      IEmailService emailService,
      ISlaService slaService,
      ILogger<TicketsController> logger)
  {
    _context = context;
    _tenantService = tenantService;
    _notificationService = notificationService;
    _emailService = emailService;
    _slaService = slaService;
    _logger = logger;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] int page = 1,
      [FromQuery] int pageSize = 50)
  {
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(userIdClaim, out var userId);

    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    )?.Value ?? User.FindFirst("role")?.Value;

    var query = _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsQueryable();

    if (roleClaim == "Agent")
    {
      var groupIds = await _context.AgentGroupMembers
          .AsNoTracking()
          .Where(m => m.UserId == userId)
          .Select(m => m.AgentGroupId)
          .ToListAsync();

      query = query.Where(t =>
          t.AssignedToUserId == userId ||
          (t.AgentGroupId.HasValue &&
           groupIds.Contains(t.AgentGroupId.Value)) ||
          !t.AgentGroupId.HasValue);
    }

    var tickets = await query
        .OrderByDescending(t => t.CreatedAt)
        .Take(200)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.Category,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          TicketType = t.TicketType ?? "Support",
          t.Tags,
          t.TicketNumber,
          CreatedBy = t.CreatedBy!.FullName,
          AssignedTo = t.AssignedTo != null
                ? t.AssignedTo.FullName : null,
          t.CreatedAt,
          CommentsCount = _context.TicketComments
                .Count(c => c.TicketId == t.Id),
          t.SlaDeadline,
          t.SlaStatus,
          t.IsSlaBreached
        })
        .ToListAsync();

    return Ok(tickets);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var ticket = await _context.Tickets
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.AgentGroup)
        .Include(t => t.Comments)
            .ThenInclude(c => c.User)
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null)
      return NotFound(new { message = "Ticket not found" });

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    )?.Value ?? User.FindFirst("role")?.Value;

    bool isAgent = roleClaim == "Agent"
        || roleClaim == "CompanyAdmin"
        || roleClaim == "SuperAdmin";

    var attachments = await _context.TicketAttachments
        .Include(a => a.UploadedBy)
        .Where(a => a.TicketId == id)
        .OrderByDescending(a => a.UploadedAt)
        .Select(a => new
        {
          a.Id,
          a.FileName,
          a.FileUrl,
          a.ContentType,
          a.FileSize,
          a.UploadedAt,
          a.CommentId,
          UploadedBy = a.UploadedBy!.FullName,
          IsImage = a.ContentType.StartsWith("image/"),
          SizeFormatted = FormatSize(a.FileSize)
        })
        .ToListAsync();

    return Ok(new
    {
      ticket.Id,
      ticket.Title,
      Description = ticket.Description,
      ticket.Category,
      Status = ticket.Status.ToString(),
      Priority = ticket.Priority.ToString(),
      TicketType = ticket.TicketType ?? "Support",
      ticket.Tags,
      ticket.CreatedAt,
      ticket.UpdatedAt,
      ticket.ResolvedAt,
      ticket.SlaDeadline,
      ticket.SlaStatus,
      ticket.IsSlaBreached,
      ticket.TimeSpentMinutes,
      ticket.AgentGroupId,
      ticket.TicketNumber,
      TicketId = $"#TN{ticket.TicketNumber}",
      CreatedBy = ticket.CreatedBy == null ? null : new
      {
        ticket.CreatedBy.Id,
        ticket.CreatedBy.FullName,
        ticket.CreatedBy.Email,
        ticket.CreatedBy.PhotoUrl
      },
      AssignedTo = ticket.AssignedTo == null ? null : new
      {
        ticket.AssignedTo.Id,
        ticket.AssignedTo.FullName,
        ticket.AssignedTo.Email,
        ticket.AssignedTo.PhotoUrl
      },
      AgentGroup = ticket.AgentGroup == null ? null : new
      {
        ticket.AgentGroup.Id,
        ticket.AgentGroup.Name
      },
      Comments = ticket.Comments
            .Where(c => isAgent || !c.IsInternal)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
              c.Id,
              c.Comment,
              c.CreatedAt,
              c.IsInternal,
              User = new
              {
                c.User!.FullName,
                c.User.Email,
                c.User.PhotoUrl
              },
              IsAgent = c.User.Role == UserRole.Agent
                    || c.User.Role == UserRole.CompanyAdmin
            }).ToList(),
      Attachments = attachments
    });
  }

  private static string FormatSize(long bytes)
  {
    if (bytes < 1024) return $"{bytes} B";
    if (bytes < 1048576) return $"{bytes / 1024} KB";
    return $"{bytes / 1048576} MB";
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateTicketDto dto)
  {
    var userIdClaim =
        User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;

    if (!Guid.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    // ✅ Get next ticket number — thread safe
    var orgId = _tenantService.OrganizationId!.Value;

    var lastNum = await _context.Tickets
        .IgnoreQueryFilters()
        .Where(t => t.OrganizationId == orgId)
        .MaxAsync(t => (int?)t.TicketNumber)
        ?? 1000;

    var ticket = new Ticket
    {
      Title = dto.Title?.Trim()
            ?? throw new ArgumentNullException(
                nameof(dto.Title)),
      Description = dto.Description
            ?? string.Empty,
      Category = dto.Category ?? "General",
      Priority = Enum.TryParse<TicketPriority>(
            dto.Priority, out var p)
            ? p : TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = dto.TicketType ?? "Support",
      OrganizationId = orgId,
      CreatedByUserId = userId,
      Tags = dto.Tags ?? string.Empty,
      AssignedToUserId =
            dto.AssignedToUserId.HasValue &&
            dto.AssignedToUserId.Value != Guid.Empty
                ? dto.AssignedToUserId
                : null,
      AgentGroupId =
            dto.AgentGroupId.HasValue &&
            dto.AgentGroupId.Value != Guid.Empty
                ? dto.AgentGroupId
                : null,
      TicketNumber = lastNum + 1  // ✅ manual set
    };

    ticket.SlaDeadline = _slaService
        .CalculateSlaDeadline(
            ticket.Priority, ticket.CreatedAt);
    ticket.SlaStatus = "OnTrack";

    _context.Tickets.Add(ticket);

    try
    {
      await _context.SaveChangesAsync();
    }
    catch (DbUpdateException ex)
    {
      _logger.LogError(ex,
          "Ticket create DB error");

      // Retry with new number if conflict
      if (ex.InnerException?.Message
              .Contains("IDENTITY_INSERT") == true ||
          ex.InnerException?.Message
              .Contains("duplicate") == true)
      {
        var retryNum = await _context.Tickets
            .IgnoreQueryFilters()
            .Where(t => t.OrganizationId == orgId)
            .MaxAsync(t => (int?)t.TicketNumber)
            ?? 1000;

        ticket.TicketNumber = retryNum + 1;

        try
        {
          await _context.SaveChangesAsync();
        }
        catch (Exception retryEx)
        {
          return StatusCode(500, new
          {
            message = "Failed to create ticket",
            error = retryEx.InnerException?.Message
                  ?? retryEx.Message
          });
        }
      }
      else
      {
        return StatusCode(500, new
        {
          message = "Failed to create ticket",
          error = ex.InnerException?.Message
                ?? ex.Message
        });
      }
    }

    // Notify agents
    var agents = await _context.Users
        .IgnoreQueryFilters()
        .Where(u =>
            u.OrganizationId == orgId &&
            (u.Role == UserRole.Agent ||
             u.Role == UserRole.CompanyAdmin))
        .Select(u => new { u.Id })
        .ToListAsync();

    foreach (var agent in agents)
    {
      _context.Notifications.Add(new Notification
      {
        UserId = agent.Id,
        OrganizationId = orgId,
        Title = "New Ticket",
        Message = $"New ticket: {ticket.Title}",
        Type = "info",
        TicketId = ticket.Id
      });
    }

    // Activity log
    await _notificationService.CreateActivityAsync(
        userId, orgId,
        "Created",
        $"New ticket: {ticket.Title}",
        "Ticket",
        ticket.Id);

    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Ticket created",
      id = ticket.Id,
      ticketNumber = ticket.TicketNumber
    });
  }

  [HttpPut("{id}/status")]
  public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusDto dto)
  {
    var ticket = await _context.Tickets
        .Include(t => t.CreatedBy)
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null) return NotFound();

    ticket.Status = Enum.Parse<TicketStatus>(dto.Status);
    ticket.UpdatedAt = DateTime.UtcNow;

    if (ticket.Status == TicketStatus.Resolved)
      ticket.ResolvedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (Guid.TryParse(userIdClaim, out var uid))
    {
      await _notificationService.CreateActivityAsync(
          uid, ticket.OrganizationId,
          "StatusChanged",
          $"Ticket '{ticket.Title}' status → {dto.Status}",
          "Ticket", ticket.Id);
    }

    // Email to ticket creator
    if (ticket.CreatedBy != null)
    {
      try
      {
        await _emailService.SendTicketStatusChangedEmailAsync(
            ticket.CreatedBy.Email,
            ticket.CreatedBy.FullName,
            ticket.Title,
            dto.Status,
            id.ToString());
      }
      catch { }
    }

    return Ok(new { message = "Status updated" });
  }

  [HttpPost("{id}/comments")]
  public async Task<IActionResult> AddComment(Guid id,
      [FromBody] AddCommentDto dto)
  {
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (!Guid.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    var comment = new TicketComment
    {
      Comment = dto.Comment,
      TicketId = id,
      UserId = userId,
      OrganizationId = _tenantService.OrganizationId!.Value,
      IsInternal = dto.IsInternal
    };
    _context.TicketComments.Add(comment);
    if (!dto.IsInternal && ticket.Status == TicketStatus.Open)
    {
      ticket.Status = TicketStatus.InProgress;
      ticket.UpdatedAt = DateTime.UtcNow;
    }

    await _context.SaveChangesAsync();

    await _notificationService.CreateActivityAsync(
        userId, _tenantService.OrganizationId!.Value,
        "Commented",
        $"Comment added on ticket: {ticket.Title}",
        "Ticket", ticket.Id);

    return Ok(new
    {
      message = "Comment added",
      commentId = comment.Id
    });
  }

  [HttpPut("{id}/assign")]
  public async Task<IActionResult> AssignTicket(Guid id, [FromBody] AssignTicketDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.AssignedToUserId = dto.AgentId;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;

    if (Guid.TryParse(userIdClaim, out var uid))
    {
      await _notificationService.CreateActivityAsync(
          uid, ticket.OrganizationId,
          "Assigned", $"Ticket '{ticket.Title}' assigned to agent",
          "Ticket", ticket.Id);

      if (dto.AgentId.HasValue)
      {
        await _notificationService.CreateAsync(
            dto.AgentId.Value, ticket.OrganizationId,
            "Ticket Assigned",
            $"You have been assigned ticket: {ticket.Title}",
            "info", ticket.Id);

        var agent = await _context.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == dto.AgentId.Value);
        if (agent != null)
        {
          try
          {
            await _emailService.SendTicketAssignedEmailAsync(
                agent.Email, agent.FullName,
                ticket.Title, ticket.Id.ToString());
          }
          catch { }
        }
      }
    }

    return Ok(new { message = "Ticket assigned successfully" });
  }

  [HttpPost("bulk-update")]
  public async Task<IActionResult> BulkUpdate([FromBody] BulkUpdateDto dto)
  {
    var tickets = await _context.Tickets
        .Where(t => dto.TicketIds.Contains(t.Id))
        .ToListAsync();

    if (!tickets.Any())
      return BadRequest(new { message = "No tickets found" });

    foreach (var ticket in tickets)
    {
      if (!string.IsNullOrEmpty(dto.Status))
        ticket.Status = Enum.Parse<TicketStatus>(dto.Status);

      if (dto.AssignedToUserId.HasValue)
        ticket.AssignedToUserId = dto.AssignedToUserId;

      ticket.UpdatedAt = DateTime.UtcNow;
    }

    await _context.SaveChangesAsync();

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (Guid.TryParse(userIdClaim, out var uid))
    {
      await _notificationService.CreateActivityAsync(
          uid, _tenantService.OrganizationId!.Value,
          "BulkUpdate",
          $"Bulk updated {tickets.Count} tickets",
          "Ticket");
    }

    return Ok(new { message = $"{tickets.Count} tickets updated" });
  }

  [HttpGet("export")]
  public async Task<IActionResult> Export(
      [FromQuery] string? status,
      [FromQuery] string? priority)
  {
    var query = _context.Tickets
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsQueryable();

    if (!string.IsNullOrEmpty(status) && status != "All")
      query = query.Where(t =>
          t.Status == Enum.Parse<TicketStatus>(status));

    if (!string.IsNullOrEmpty(priority) && priority != "All")
      query = query.Where(t =>
          t.Priority == Enum.Parse<TicketPriority>(priority));

    var tickets = await query
        .OrderByDescending(t => t.CreatedAt)
        .ToListAsync();

    var sb = new System.Text.StringBuilder();
    sb.AppendLine("Id,Title,Category,Status,Priority," +
        "CreatedBy,AssignedTo,SlaStatus,CreatedAt,ResolvedAt");

    foreach (var t in tickets)
    {
      sb.AppendLine(
          $"{t.Id}," +
          $"\"{t.Title}\"," +
          $"{t.Category}," +
          $"{t.Status}," +
          $"{t.Priority}," +
          $"{t.CreatedBy?.FullName}," +
          $"{t.AssignedTo?.FullName ?? "Unassigned"}," +
          $"{t.SlaStatus ?? "N/A"}," +
          $"{t.CreatedAt:yyyy-MM-dd HH:mm}," +
          $"{(t.ResolvedAt.HasValue ? t.ResolvedAt.Value.ToString("yyyy-MM-dd HH:mm") : "")}");
    }

    var bytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString());
    return File(bytes, "text/csv",
        $"tickets-{DateTime.Now:yyyy-MM-dd}.csv");
  }

  [HttpGet("search")]
  public async Task<IActionResult> Search(
      [FromQuery] string? query,
      [FromQuery] string? status,
      [FromQuery] string? priority,
      [FromQuery] string? category)
  {
    var tickets = _context.Tickets
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.Comments)
        .AsQueryable();

    if (!string.IsNullOrEmpty(query))
      tickets = tickets.Where(t =>
          t.Title.Contains(query) ||
          t.Description.Contains(query));

    if (!string.IsNullOrEmpty(status) && status != "All")
      tickets = tickets.Where(t =>
          t.Status == Enum.Parse<TicketStatus>(status));

    if (!string.IsNullOrEmpty(priority) && priority != "All")
      tickets = tickets.Where(t =>
          t.Priority == Enum.Parse<TicketPriority>(priority));

    if (!string.IsNullOrEmpty(category) && category != "All")
      tickets = tickets.Where(t => t.Category == category);

    var result = await tickets
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => new TicketResponseDto
        {
          Id = t.Id,
          Title = t.Title,
          Description = t.Description,
          Category = t.Category,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          TicketType = t.TicketType ?? "Support",
          Tags = t.Tags,
          CreatedBy = t.CreatedBy!.FullName,
          AssignedTo = t.AssignedTo != null
                ? t.AssignedTo.FullName : null,
          CreatedAt = t.CreatedAt,
          CommentsCount = t.Comments.Count,
          SlaDeadline = t.SlaDeadline,
          SlaStatus = t.SlaStatus,
          IsSlaBreached = t.IsSlaBreached
        })
        .ToListAsync();

    return Ok(result);
  }

  [HttpGet("by-tag/{tag}")]
  public async Task<IActionResult> GetByTag(string tag)
  {
    var tickets = await _context.Tickets
        .Include(t => t.CreatedBy)
        .Where(t => t.Tags != null && t.Tags.Contains(tag.ToLower()))
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => new TicketResponseDto
        {
          Id = t.Id,
          Title = t.Title,
          Description = t.Description,
          Category = t.Category,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          CreatedBy = t.CreatedBy!.FullName,
          CreatedAt = t.CreatedAt,
          CommentsCount = t.Comments.Count
        })
        .ToListAsync();

    return Ok(tickets);
  }

  [HttpPut("{id}/log-time")]
  public async Task<IActionResult> LogTime(Guid id,
    [FromBody] LogTimeDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.TimeSpentMinutes += dto.Minutes;
    ticket.LastActivityAt = DateTime.UtcNow;
    ticket.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (Guid.TryParse(userIdClaim, out var uid))
    {
      await _notificationService.CreateActivityAsync(
          uid, ticket.OrganizationId,
          "TimeLogged",
          $"Logged {dto.Minutes} minutes on: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    return Ok(new
    {
      message = "Time logged",
      totalMinutes = ticket.TimeSpentMinutes,
      totalHours = Math.Round(ticket.TimeSpentMinutes / 60.0, 1)
    });
  }

  // --- UPDATED ENDPOINTS START HERE ---

  [HttpPut("{id}/priority")]
  public async Task<IActionResult> UpdatePriority(Guid id,
      [FromBody] UpdatePriorityDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.Priority = Enum.Parse<TicketPriority>(dto.Priority);
    ticket.UpdatedAt = DateTime.UtcNow;
    ticket.SlaDeadline = _slaService.CalculateSlaDeadline(
        ticket.Priority, ticket.CreatedAt);
    ticket.SlaStatus = _slaService.GetSlaStatus(
        ticket.SlaDeadline, ticket.Status);

    await _context.SaveChangesAsync();
    return Ok(new { message = "Priority updated" });
  }

  [HttpPut("{id}/type")]
  public async Task<IActionResult> UpdateType(Guid id,
      [FromBody] UpdateTypeDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.TicketType = dto.TicketType;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();
    return Ok(new { message = "Type updated" });
  }

  [HttpPut("{id}/tags")]
  public async Task<IActionResult> UpdateTags(Guid id,
      [FromBody] UpdateTagsDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.Tags = string.Join(",",
        dto.Tags.Select(t => t.Trim().ToLower())
            .Where(t => !string.IsNullOrEmpty(t))
            .Distinct());
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();
    return Ok(new { message = "Tags updated", tags = ticket.Tags });
  }

  [HttpPut("{id}/group")]
  public async Task<IActionResult> UpdateGroup(Guid id,
      [FromBody] UpdateGroupDto dto)
  {
    var ticket = await _context.Tickets.FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.AgentGroupId = dto.AgentGroupId == Guid.Empty
        ? null : dto.AgentGroupId;
    ticket.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (Guid.TryParse(userIdClaim, out var uid))
    {
      await _notificationService.CreateActivityAsync(
          uid, _tenantService.OrganizationId!.Value,
          "Updated",
          $"Group updated on ticket: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    return Ok(new { message = "Group updated" });
  }

  [HttpPost("{id}/view")]
  public async Task<IActionResult> RecordView(Guid id)
  {
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (!Guid.TryParse(userIdClaim, out var userId))
      return Ok();

    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == userId);

    var existing = await _context.TicketViewers
        .FirstOrDefaultAsync(v =>
            v.TicketId == id && v.UserId == userId);

    if (existing != null)
    {
      existing.ViewedAt = DateTime.UtcNow;
    }
    else
    {
      _context.TicketViewers.Add(new TicketViewer
      {
        TicketId = id,
        UserId = userId,
        UserName = user?.FullName ?? "Unknown",
        OrganizationId = _tenantService.OrganizationId!.Value,
        ViewedAt = DateTime.UtcNow
      });
    }

    await _context.SaveChangesAsync();
    return Ok();
  }

  [HttpGet("{id}/viewers")]
  public async Task<IActionResult> GetViewers(Guid id)
  {
    var viewers = await _context.TicketViewers
        .Where(v => v.TicketId == id
            && v.ViewedAt >= DateTime.UtcNow.AddHours(-24))
        .OrderByDescending(v => v.ViewedAt)
        .Select(v => new
        {
          v.UserId,
          v.UserName,
          v.ViewedAt
        })
        .ToListAsync();

    return Ok(viewers);
  }
}

public class UpdateStatusDto
{
  public string Status { get; set; } = string.Empty;
}

public class AddCommentDto
{
  public string Comment { get; set; } = string.Empty;
  public bool IsInternal { get; set; } = false;
}

public class AssignTicketDto
{
  public Guid? AgentId { get; set; }
}

public class BulkUpdateDto
{
  public List<Guid> TicketIds { get; set; } = new();
  public string? Status { get; set; }
  public Guid? AssignedToUserId { get; set; }
}

public class UpdateTagsDto
{
  public List<string> Tags { get; set; } = new();
}

public class LogTimeDto
{
  public int Minutes { get; set; }
  public string? Note { get; set; }
}

public class UpdatePriorityDto
{
  public string Priority { get; set; } = string.Empty;
}

public class UpdateTypeDto
{
  public string TicketType { get; set; } = string.Empty;
}

public class UpdateGroupDto
{
  public Guid? AgentGroupId { get; set; }
}
