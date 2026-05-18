using iM3Helpdesk.API.DTOs.Tickets;
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

  private Guid GetUserId()
  {
    var claim =
        User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(claim, out var id);
    return id;
  }

  private static string FormatSize(long bytes)
  {
    if (bytes < 1024) return $"{bytes} B";
    if (bytes < 1048576)
      return $"{bytes / 1024} KB";
    return $"{bytes / 1048576} MB";
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var userId = GetUserId();

    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/" +
        "identity/claims/role")?.Value
        ?? User.FindFirst("role")?.Value;

    var query = _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsSplitQuery()
        .AsQueryable();
    if (roleClaim == "Agent")
    {
      var groupIds = await _context
          .AgentGroupMembers
          .AsNoTracking()
          .Where(m => m.UserId == userId)
          .Select(m => m.AgentGroupId)
          .ToListAsync();

      query = query.Where(t =>
          t.AssignedToUserId == userId ||
          t.AssignedToUserId == null ||
          (t.AgentGroupId != null &&
           groupIds.Contains(t.AgentGroupId.Value)));
    }
    var tickets = await query
        .OrderByDescending(t => t.CreatedAt)
        .Take(500)
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
          t.CreatedAt,
          t.SlaDeadline,
          t.SlaStatus,
          t.IsSlaBreached,
          CreatedBy = t.CreatedBy != null
                ? t.CreatedBy.FullName : "",
          AssignedTo = t.AssignedTo != null
                ? t.AssignedTo.FullName : null,
          AssignedToId = t.AssignedToUserId
        })
        .ToListAsync();

    return Ok(tickets);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var ticket = await _context.Tickets
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.AgentGroup)
        .Include(t => t.Comments)
        .ThenInclude(c => c.User)
        .AsSplitQuery()
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null) return NotFound();

    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/" +
        "identity/claims/role")?.Value
        ?? User.FindFirst("role")?.Value;
    bool isAgent = roleClaim is
        "Agent" or "CompanyAdmin" or "SuperAdmin";

    var attachments = await _context.TicketAttachments
        .AsNoTracking()
        .Where(a => a.TicketId == id)
        .OrderBy(a => a.UploadedAt)
        .Select(a => new
        {
          a.Id,
          a.FileName,
          a.FileUrl,
          a.ContentType,
          a.FileSize,
          a.UploadedAt,
          a.CommentId,
          IsImage = a.ContentType.StartsWith("image/"),
          SizeFormatted = FormatSize(a.FileSize)
        })
        .ToListAsync();

    return Ok(new
    {
      ticket.Id,
      ticket.Title,
      ticket.Description,
      ticket.Category,
      Status = ticket.Status.ToString(),
      Priority = ticket.Priority.ToString(),
      TicketType = ticket.TicketType,
      ticket.Tags,
      ticket.CreatedAt,
      ticket.UpdatedAt,
      ticket.ResolvedAt,
      ticket.SlaDeadline,
      ticket.SlaStatus,
      ticket.IsSlaBreached,
      ticket.TicketNumber,
      ticket.TimeSpentMinutes,
      TicketDisplayId = $"#TN{ticket.TicketNumber}",
      AssignedToUserId = ticket.AssignedToUserId,
      AssignedTo = ticket.AssignedTo == null
            ? null : new
            {
              ticket.AssignedTo.Id,
              ticket.AssignedTo.FullName,
              ticket.AssignedTo.Email,
              ticket.AssignedTo.PhotoUrl
            },
      AgentGroupId = ticket.AgentGroupId,
      AgentGroup = ticket.AgentGroup == null
            ? null : new
            {
              ticket.AgentGroup.Id,
              ticket.AgentGroup.Name
            },
      CreatedBy = ticket.CreatedBy == null
            ? null : new
            {
              ticket.CreatedBy.Id,
              ticket.CreatedBy.FullName,
              ticket.CreatedBy.Email,
              ticket.CreatedBy.PhotoUrl
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
              Source = c.Source ?? "web",
              c.EmailMessageId,
              User = c.User == null ? null : new
              {
                c.User.Id,
                c.User.FullName,
                c.User.Email,
                c.User.PhotoUrl,
                IsAgent =
                        c.User.Role == UserRole.Agent ||
                        c.User.Role == UserRole.CompanyAdmin
              }
            })
            .ToList(),
      Attachments = attachments
    });
  }

  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateTicketDto dto)
  {
    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var orgId = _tenantService.OrganizationId!.Value;

    var lastNum = await _context.Tickets
        .IgnoreQueryFilters()
        .Where(t => t.OrganizationId == orgId)
        .MaxAsync(t => (int?)t.TicketNumber)
        ?? 1000;

    Guid? groupId = null;
    if (dto.AgentGroupId.HasValue &&
        dto.AgentGroupId.Value != Guid.Empty)
    {
      var groupExists = await _context.AgentGroups
          .AnyAsync(g =>
              g.Id == dto.AgentGroupId.Value &&
              g.OrganizationId == orgId);
      if (groupExists)
        groupId = dto.AgentGroupId.Value;
    }

    Guid? assignedTo = null;
    if (dto.AssignedToUserId.HasValue &&
        dto.AssignedToUserId.Value != Guid.Empty)
      assignedTo = dto.AssignedToUserId.Value;

    var ticket = new Ticket
    {
      Title = dto.Title?.Trim() ?? "",
      Description = dto.Description ?? "",
      Category = dto.Category ?? "General",
      Priority = Enum.TryParse<TicketPriority>(
            dto.Priority, out var p)
            ? p : TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = dto.TicketType ?? "Support",
      OrganizationId = orgId,
      CreatedByUserId = userId,
      Tags = dto.Tags ?? string.Empty,
      AssignedToUserId = assignedTo,
      AgentGroupId = groupId,
      TicketNumber = lastNum + 1
    };

    ticket.SlaDeadline = _slaService
        .CalculateSlaDeadline(
            ticket.Priority, ticket.CreatedAt);
    ticket.SlaStatus = "OnTrack";

    _context.Tickets.Add(ticket);
    await _context.SaveChangesAsync();

    await _notificationService.CreateActivityAsync(
        userId, orgId,
        "Created",
        $"New ticket: {ticket.Title}",
        "Ticket", ticket.Id);

    return Ok(new
    {
      message = "Ticket created",
      id = ticket.Id,
      ticketNumber = ticket.TicketNumber
    });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> Update(
      Guid id, [FromBody] UpdateTicketDto dto)
  {
    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null)
      return NotFound(new { message = "Ticket not found" });

    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var orgId = _tenantService.OrganizationId!.Value;

    if (!string.IsNullOrEmpty(dto.Title))
      ticket.Title = dto.Title.Trim();
    if (dto.Description != null)
      ticket.Description = dto.Description;
    if (dto.Category != null)
      ticket.Category = dto.Category;
    if (dto.TicketType != null)
      ticket.TicketType = dto.TicketType;
    if (dto.Tags != null)
      ticket.Tags = dto.Tags;

    if (!string.IsNullOrEmpty(dto.Priority) &&
        Enum.TryParse<TicketPriority>(
            dto.Priority, out var newP))
    {
      ticket.Priority = newP;
      ticket.SlaDeadline = _slaService
          .CalculateSlaDeadline(
              ticket.Priority, ticket.CreatedAt);
      ticket.SlaStatus = _slaService
          .GetSlaStatus(
              ticket.SlaDeadline, ticket.Status);
    }

    if (!string.IsNullOrEmpty(dto.Status) &&
        Enum.TryParse<TicketStatus>(
            dto.Status, out var newS))
    {
      if (newS == TicketStatus.Resolved &&
          ticket.Status != TicketStatus.Resolved)
        ticket.ResolvedAt = DateTime.UtcNow;
      ticket.Status = newS;
    }

    if (dto.AssignedToUserId.HasValue)
    {
      if (dto.AssignedToUserId.Value == Guid.Empty)
        ticket.AssignedToUserId = null;
      else
      {
        var agentExists = await _context.Users
            .IgnoreQueryFilters()
            .AnyAsync(u =>
                u.Id == dto.AssignedToUserId.Value &&
                u.OrganizationId == orgId);
        if (agentExists)
          ticket.AssignedToUserId =
              dto.AssignedToUserId.Value;
      }
    }

    if (dto.AgentGroupId.HasValue)
    {
      if (dto.AgentGroupId.Value == Guid.Empty)
        ticket.AgentGroupId = null;
      else
      {
        var groupExists = await _context.AgentGroups
            .AnyAsync(g =>
                g.Id == dto.AgentGroupId.Value &&
                g.OrganizationId == orgId);
        if (groupExists)
          ticket.AgentGroupId =
              dto.AgentGroupId.Value;
      }
    }

    ticket.UpdatedAt = DateTime.UtcNow;
    ticket.LastActivityAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    await _notificationService.CreateActivityAsync(
        userId, orgId,
        "Updated",
        $"Ticket updated: {ticket.Title}",
        "Ticket", ticket.Id);

    return Ok(new { message = "Updated successfully" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    _context.Tickets.Remove(ticket);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Deleted" });
  }

  // ── DETECT DUPLICATES ──────────────────
  [HttpGet("{id}/duplicates")]
  public async Task<IActionResult>
      GetDuplicates(Guid id)
  {
    var orgId =
        _tenantService.OrganizationId!.Value;

    var current = await _context.Tickets
        .AsNoTracking()
        .FirstOrDefaultAsync(t => t.Id == id);

    if (current == null)
      return NotFound();

    var cutoff =
        DateTime.UtcNow.AddDays(-60);

    var others = await _context.Tickets
        .AsNoTracking()
        .Where(t =>
            t.OrganizationId == orgId &&
            t.Id != id &&
            t.Status != TicketStatus.Closed &&
            t.CreatedAt >= cutoff)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.TicketNumber,
          t.Status,
          t.CreatedAt,
          t.CreatedByUserId
        })
        .Take(200)
        .ToListAsync();

    var currentWords = GetWords(current.Title);
    var duplicates = new List<object>();

    foreach (var t in others)
    {
      var words = GetWords(t.Title);
      var sim = GetSimilarity(
          currentWords, words);

      var sameCustomer =
          current.CreatedByUserId ==
          t.CreatedByUserId;

      var score = sim
          + (sameCustomer ? 0.2 : 0);

      if (score >= 0.5)
      {
        duplicates.Add(new
        {
          t.Id,
          t.TicketNumber,
          t.Title,
          Status = t.Status.ToString(),
          t.CreatedAt,
          Similarity =
                (int)(score * 100),
          SameCustomer = sameCustomer
        });
      }
    }

    return Ok(duplicates
        .OrderByDescending(d =>
            ((dynamic)d).Similarity)
        .Take(5)
        .ToList());
  }

  // ── MERGE TICKETS ──────────────────────
  [HttpPost("{id}/merge")]
  public async Task<IActionResult> Merge(
      Guid id,
      [FromBody] MergeIntoDto dto)
  {
    var userId = GetUserId();
    var orgId =
        _tenantService.OrganizationId!.Value;

    // Original ticket (keep this)
    var original = await _context.Tickets
        .Include(t => t.CreatedBy)
        .FirstOrDefaultAsync(t =>
            t.Id == id &&
            t.OrganizationId == orgId);

    if (original == null)
      return NotFound(new
      {
        message = "Original ticket not found"
      });

    // Duplicate ticket (close this)
    var duplicate = await _context.Tickets
        .Include(t => t.CreatedBy)
        .FirstOrDefaultAsync(t =>
            t.Id == dto.DuplicateTicketId &&
            t.OrganizationId == orgId &&
            t.Id != id);

    if (duplicate == null)
      return NotFound(new
      {
        message = "Duplicate ticket not found"
      });

    // Close duplicate
    duplicate.Status = TicketStatus.Closed;
    duplicate.ResolvedAt = DateTime.UtcNow;
    duplicate.UpdatedAt = DateTime.UtcNow;

    // Add note to duplicate
    _context.TicketComments.Add(
        new TicketComment
        {
          TicketId = duplicate.Id,
          UserId = userId,
          Comment =
                $"🔀 This ticket has been " +
                $"merged into " +
                $"<strong>#TN{original.TicketNumber}" +
                $"</strong> — " +
                $"<em>{original.Title}</em>. " +
                $"Please follow up on the " +
                $"original ticket.",
          IsInternal = false,
          Source = "system",
          OrganizationId = orgId
        });

    // Add note to original
    _context.TicketComments.Add(
        new TicketComment
        {
          TicketId = original.Id,
          UserId = userId,
          Comment =
                $"🔀 Ticket " +
                $"<strong>#TN{duplicate.TicketNumber}" +
                $"</strong> has been merged " +
                $"into this ticket.",
          IsInternal = true,
          Source = "system",
          OrganizationId = orgId
        });

    // Activity log
    await _notificationService
        .CreateActivityAsync(
            userId, orgId,
            "Merged",
            $"#TN{duplicate.TicketNumber} " +
            $"merged into " +
            $"#TN{original.TicketNumber}",
            "Ticket", original.Id);

    await _context.SaveChangesAsync();

    // Send email to customer of duplicate
    if (duplicate.CreatedBy?.Email != null)
    {
      try
      {
        await _emailService.SendAsync(
            duplicate.CreatedBy.Email,
            $"Ticket #TN{duplicate.TicketNumber}" +
            $" merged",
            $"<p>Hi {duplicate.CreatedBy.FullName}," +
            $"</p><p>Your ticket " +
            $"<strong>#TN{duplicate.TicketNumber}" +
            $"</strong> has been merged into " +
            $"<strong>#TN{original.TicketNumber}" +
            $"</strong>. " +
            $"Please use that ticket number " +
            $"for future reference.</p>");
      }
      catch { /* don't fail on email error */ }
    }

    return Ok(new
    {
      message =
            $"#TN{duplicate.TicketNumber} " +
            $"merged into " +
            $"#TN{original.TicketNumber}",
      originalId = original.Id,
      duplicateId = duplicate.Id,
      duplicateTicketNumber =
            duplicate.TicketNumber
    });
  }

  // ── Helpers ────────────────────────────
  private static List<string> GetWords(
      string text)
  {
    if (string.IsNullOrEmpty(text))
      return new();
    return text.ToLower()
        .Split(new[]
        {
                ' ',',','.','!','?',
                '-','_','/','(',')','['
        }, StringSplitOptions
            .RemoveEmptyEntries)
        .Where(w => w.Length > 2)
        .ToList();
  }

  private static double GetSimilarity(
      List<string> w1, List<string> w2)
  {
    if (!w1.Any() || !w2.Any())
      return 0;
    var inter = w1.Intersect(w2).Count();
    var union = w1.Union(w2).Count();
    return union > 0
        ? (double)inter / union : 0;
  }

  [HttpGet("{id}/timeline")]
  public async Task<IActionResult> GetTimeline(Guid id)
  {
    var logs = await _context.ActivityLogs
        .AsNoTracking()
        .Where(a => a.EntityId == id)
        .OrderByDescending(a => a.CreatedAt)
        .Select(a => new
        {
          a.Id,
          a.Action,
          a.Description,
          a.CreatedAt,
          User = a.User != null
                ? a.User.FullName : "System"
        })
        .ToListAsync();

    return Ok(logs);
  }

  [HttpPut("{id}/status")]
  public async Task<IActionResult> UpdateStatus(
      Guid id, [FromBody] UpdateStatusDto dto)
  {
    var ticket = await _context.Tickets
        .Include(t => t.CreatedBy)
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null) return NotFound();
    var statusStr = dto.Status?.Trim() ?? "";
    if (!Enum.TryParse<TicketStatus>(
        statusStr, true, out var newStatus))
      return BadRequest(new
      {
        message = $"Invalid status: {statusStr}"
      });

    ticket.Status = newStatus;
    ticket.UpdatedAt = DateTime.UtcNow;

    if (newStatus == TicketStatus.Resolved &&
        !ticket.ResolvedAt.HasValue)
      ticket.ResolvedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await _notificationService.CreateActivityAsync(
          userId, ticket.OrganizationId,
          "StatusChanged",
          $"Status → {newStatus}: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    if (ticket.CreatedBy?.Email != null)
    {
      try
      {
        var html = $@"
        <div style='font-family:Arial;max-width:600px'>
          <p>Your ticket <strong>{ticket.Title}</strong>
          (#TN{ticket.TicketNumber}) status has been 
          updated to <strong>{newStatus}</strong>.</p>
        </div>";
        await _emailService.SendAsync(
            ticket.CreatedBy.Email,
            $"Ticket #{ticket.TicketNumber} Status: {newStatus}",
            html);
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex, "Status email failed");
      }
    }
    return Ok(new { message = "Status updated" });
  }

  [HttpPost("{id}/comments")]
  public async Task<IActionResult> AddComment(
      Guid id,
      [FromBody] AddCommentDto dto)
  {
    var ticket = await _context.Tickets
        .Include(t => t.CreatedBy)
        .FirstOrDefaultAsync(t => t.Id == id);

    if (ticket == null) return NotFound();

    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == userId);

    var comment = new TicketComment
    {
      TicketId = id,
      UserId = userId,
      Comment = dto.Comment,
      IsInternal = dto.IsInternal,
      Source = "web",
      OrganizationId =
            _tenantService.OrganizationId!.Value
    };

    _context.TicketComments.Add(comment);

    // Update ticket activity time
    ticket.LastActivityAt = DateTime.UtcNow;
    ticket.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    // ✅ Send email if public reply
    if (!dto.IsInternal &&
        ticket.CreatedBy?.Email != null)
    {
      try
      {
        await _emailService.SendReplyAsync(
            ticket.CreatedBy.Email,
            ticket.Title,
            dto.Comment,
            $"#TN{ticket.TicketNumber}",
            agent?.FullName ?? "Support",
            agent?.Signature ?? "");
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex,
            "Reply email failed");
      }
    }

    await _notificationService.CreateActivityAsync(
        userId,
        _tenantService.OrganizationId!.Value,
        dto.IsInternal ? "NoteAdded" : "Commented",
        dto.IsInternal
            ? "Added a private note"
            : "Replied to customer",
        "Ticket", id);

    return Ok(new
    {
      commentId = comment.Id,
      message = "Comment added"
    });
  }

  [HttpPut("{id}/assign")]
  public async Task<IActionResult> AssignTicket(
      Guid id, [FromBody] AssignTicketDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.AssignedToUserId = dto.AgentId;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await _notificationService.CreateActivityAsync(
          userId, ticket.OrganizationId,
          "Assigned",
          $"Ticket assigned: {ticket.Title}",
          "Ticket", ticket.Id);

      if (dto.AgentId.HasValue)
      {
        await _notificationService.CreateAsync(
            dto.AgentId.Value,
            ticket.OrganizationId,
            "Ticket Assigned",
            $"You have been assigned: {ticket.Title}",
            "info", ticket.Id);

        // Send email to agent
        var agent = await _context.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u =>
                u.Id == dto.AgentId.Value);

        if (agent?.Email != null)
        {
          try
          {
            var html = $@"
<div style='font-family:Arial;max-width:600px'>
  <p>Hi {agent.FullName},</p>
  <p>Ticket <strong>{ticket.Title}</strong>
  (#TN{ticket.TicketNumber}) has been assigned to you.
  </p>
</div>";
            await _emailService.SendAsync(
                agent.Email,
                $"Ticket Assigned: #{ticket.TicketNumber}",
                html);
          }
          catch (Exception ex)
          {
            _logger.LogWarning(ex,
                "Assign email failed");
          }
        }
      }
    }

    return Ok(new
    {
      message = "Ticket assigned successfully"
    });
  }


  [HttpPut("{id}/group")]
  public async Task<IActionResult> UpdateGroup(
      Guid id, [FromBody] UpdateGroupDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.AgentGroupId =
        dto.AgentGroupId == Guid.Empty
            ? null : dto.AgentGroupId;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await _notificationService.CreateActivityAsync(
          userId,
          _tenantService.OrganizationId!.Value,
          "GroupChanged",
          $"Group updated: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    return Ok(new { message = "Group updated" });
  }


  [HttpPut("{id}/priority")]
  public async Task<IActionResult> UpdatePriority(
      Guid id, [FromBody] UpdatePriorityDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    if (!Enum.TryParse<TicketPriority>(
        dto.Priority, out var newP))
      return BadRequest();

    ticket.Priority = newP;
    ticket.UpdatedAt = DateTime.UtcNow;
    ticket.SlaDeadline = _slaService
        .CalculateSlaDeadline(
            ticket.Priority, ticket.CreatedAt);
    ticket.SlaStatus = _slaService
        .GetSlaStatus(
            ticket.SlaDeadline, ticket.Status);

    await _context.SaveChangesAsync();
    return Ok(new { message = "Priority updated" });
  }


  [HttpPut("{id}/type")]
  public async Task<IActionResult> UpdateType(
      Guid id, [FromBody] UpdateTypeDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.TicketType = dto.TicketType;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();
    return Ok(new { message = "Type updated" });
  }


  [HttpPut("{id}/tags")]
  public async Task<IActionResult> UpdateTags(
      Guid id, [FromBody] UpdateTagsDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.Tags = string.Join(",",
        dto.Tags
            .Select(t => t.Trim().ToLower())
            .Where(t => !string.IsNullOrEmpty(t))
            .Distinct());
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Tags updated",
      tags = ticket.Tags
    });
  }


  [HttpPut("{id}/log-time")]
  public async Task<IActionResult> LogTime(
      Guid id, [FromBody] LogTimeDto dto)
  {
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    ticket.TimeSpentMinutes += dto.Minutes;
    ticket.LastActivityAt = DateTime.UtcNow;
    ticket.UpdatedAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await _notificationService.CreateActivityAsync(
          userId, ticket.OrganizationId,
          "TimeLogged",
          $"Logged {dto.Minutes} min: {ticket.Title}",
          "Ticket", ticket.Id);
    }

    return Ok(new
    {
      message = "Time logged",
      totalMinutes = ticket.TimeSpentMinutes,
      totalHours = Math.Round(
            ticket.TimeSpentMinutes / 60.0, 1)
    });
  }


  [HttpPost("{id}/forward")]
  public async Task<IActionResult> ForwardTicket(
      Guid id,
      [FromBody] ForwardTicketDto dto)
  {
    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t => t.Id == id);
    if (ticket == null) return NotFound();

    if (string.IsNullOrEmpty(dto.ToEmail))
      return BadRequest(new
      {
        message = "Email is required"
      });

    try
    {
      var html = $@"
<div style='font-family:Arial;max-width:600px'>
  <p>A support ticket has been forwarded to you:</p>
  <h3>{ticket.Title}</h3>
  <p><strong>Ticket ID:</strong>
    #TN{ticket.TicketNumber}</p>
  <hr/>
  <div>{dto.Message ?? ticket.Description}</div>
</div>";

      await _emailService.SendAsync(
          dto.ToEmail,
          $"[Forwarded] {ticket.Title}" +
          $" #TN{ticket.TicketNumber}",
          html);

      return Ok(new
      {
        message = "Forwarded successfully"
      });
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Forward failed");
      return StatusCode(500, new
      {
        message = "Forward failed"
      });
    }
  }

  [HttpPost("{id}/view")]
  public async Task<IActionResult> RecordView(Guid id)
  {
    var userId = GetUserId();
    if (userId == Guid.Empty) return Ok();

    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == userId);

    var existing = await _context.TicketViewers
        .FirstOrDefaultAsync(v =>
            v.TicketId == id &&
            v.UserId == userId);

    if (existing != null)
      existing.ViewedAt = DateTime.UtcNow;
    else
      _context.TicketViewers.Add(new TicketViewer
      {
        TicketId = id,
        UserId = userId,
        UserName = user?.FullName ?? "Unknown",
        OrganizationId =
              _tenantService.OrganizationId!.Value,
        ViewedAt = DateTime.UtcNow
      });

    await _context.SaveChangesAsync();
    return Ok();
  }

  [HttpGet("{id}/viewers")]
  public async Task<IActionResult> GetViewers(Guid id)
  {
    var viewers = await _context.TicketViewers
        .Where(v =>
            v.TicketId == id &&
            v.ViewedAt >=
                DateTime.UtcNow.AddHours(-24))
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

  [HttpPost("bulk-update")]
  public async Task<IActionResult> BulkUpdate(
      [FromBody] BulkUpdateDto dto)
  {
    var tickets = await _context.Tickets
        .Where(t => dto.TicketIds.Contains(t.Id))
        .ToListAsync();

    if (!tickets.Any())
      return BadRequest(new
      {
        message = "No tickets found"
      });

    foreach (var t in tickets)
    {
      if (!string.IsNullOrEmpty(dto.Status) &&
          Enum.TryParse<TicketStatus>(
              dto.Status, out var s))
        t.Status = s;

      if (dto.AssignedToUserId.HasValue)
        t.AssignedToUserId =
            dto.AssignedToUserId;

      t.UpdatedAt = DateTime.UtcNow;
    }

    await _context.SaveChangesAsync();

    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await _notificationService.CreateActivityAsync(
          userId,
          _tenantService.OrganizationId!.Value,
          "BulkUpdate",
          $"Bulk updated {tickets.Count} tickets",
          "Ticket");
    }

    return Ok(new
    {
      message = $"{tickets.Count} tickets updated"
    });
  }

  [HttpGet("export")]
  public async Task<IActionResult> Export(
      [FromQuery] string? status,
      [FromQuery] string? priority)
  {
    var query = _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsQueryable();

    if (!string.IsNullOrEmpty(status) &&
        status != "All" &&
        Enum.TryParse<TicketStatus>(
            status, out var sFilter))
      query = query.Where(t =>
          t.Status == sFilter);

    if (!string.IsNullOrEmpty(priority) &&
        priority != "All" &&
        Enum.TryParse<TicketPriority>(
            priority, out var pFilter))
      query = query.Where(t =>
          t.Priority == pFilter);

    var tickets = await query
        .OrderByDescending(t => t.CreatedAt)
        .ToListAsync();

    var sb = new System.Text.StringBuilder();
    sb.AppendLine(
        "Id,TicketNumber,Title,Category,Status," +
        "Priority,CreatedBy,AssignedTo," +
        "SlaStatus,CreatedAt,ResolvedAt");

    foreach (var t in tickets)
    {
      sb.AppendLine(
          $"{t.Id}," +
          $"TN{t.TicketNumber}," +
          $"\"{t.Title.Replace("\"", "\"\"")}\"," +
          $"{t.Category}," +
          $"{t.Status}," +
          $"{t.Priority}," +
          $"\"{t.CreatedBy?.FullName ?? ""}\"," +
          $"\"{t.AssignedTo?.FullName ?? "Unassigned"}\"," +
          $"{t.SlaStatus ?? "N/A"}," +
          $"{t.CreatedAt:yyyy-MM-dd HH:mm}," +
          $"{(t.ResolvedAt.HasValue ? t.ResolvedAt.Value.ToString("yyyy-MM-dd HH:mm") : "")}");
    }

    var bytes = System.Text.Encoding.UTF8
        .GetBytes(sb.ToString());
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
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsQueryable();

    if (!string.IsNullOrEmpty(query))
      tickets = tickets.Where(t =>
          t.Title.Contains(query) ||
          t.Description.Contains(query));

    if (!string.IsNullOrEmpty(status) &&
        status != "All" &&
        Enum.TryParse<TicketStatus>(
            status, out var sf))
      tickets = tickets.Where(t =>
          t.Status == sf);

    if (!string.IsNullOrEmpty(priority) &&
        priority != "All" &&
        Enum.TryParse<TicketPriority>(
            priority, out var pf))
      tickets = tickets.Where(t =>
          t.Priority == pf);

    if (!string.IsNullOrEmpty(category) &&
        category != "All")
      tickets = tickets.Where(t =>
          t.Category == category);

    var result = await tickets
        .OrderByDescending(t => t.CreatedAt)
        .Take(50)
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
          t.CreatedAt,
          t.SlaDeadline,
          t.SlaStatus,
          t.IsSlaBreached,
          CreatedBy = t.CreatedBy != null
                ? t.CreatedBy.FullName : "",
          AssignedTo = t.AssignedTo != null
                ? t.AssignedTo.FullName : null
        })
        .ToListAsync();

    return Ok(result);
  }

  [HttpGet("by-tag/{tag}")]
  public async Task<IActionResult> GetByTag(string tag)
  {
    var tickets = await _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Where(t =>
            t.Tags != null &&
            t.Tags.Contains(tag.ToLower()))
        .OrderByDescending(t => t.CreatedAt)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.Category,
          Status = t.Status.ToString(),
          Priority = t.Priority.ToString(),
          t.TicketNumber,
          t.CreatedAt,
          CreatedBy = t.CreatedBy != null
                ? t.CreatedBy.FullName : ""
        })
        .ToListAsync();

    return Ok(tickets);
  }
}

public class UpdateTicketDto
{
  public string? Title { get; set; }
  public string? Description { get; set; }
  public string? Category { get; set; }
  public string? Priority { get; set; }
  public string? Status { get; set; }
  public string? TicketType { get; set; }
  public string? Tags { get; set; }
  public Guid? AssignedToUserId { get; set; }
  public Guid? AgentGroupId { get; set; }
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

public class MergeIntoDto
{
  public Guid DuplicateTicketId { get; set; }
  public string? Note { get; set; }
}

public class UpdateGroupDto
{
  public Guid? AgentGroupId { get; set; }
}

public class ForwardTicketDto
{
  public string ToEmail { get; set; } = string.Empty;
  public string? Message { get; set; }
}
