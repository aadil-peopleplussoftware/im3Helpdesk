using iM3Helpdesk.API.Common.Helpers;
using iM3Helpdesk.API.Middleware;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Application.Contracts.Services;
using iM3Helpdesk.Application.DTOs.Tickets;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using static iM3Helpdesk.API.Common.Helpers.TicketEnumHelpers;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketsController : TicketsControllerBase
{
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
      : base(context)
  {
    _tenantService = tenantService;
    _notificationService = notificationService;
    _emailService = emailService;
    _slaService = slaService;
    _logger = logger;
  }
  [HttpGet("my-status-counts")]
  public async Task<IActionResult> GetMyStatusCounts()
  {
    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/" +
        "identity/claims/role")?.Value
        ?? User.FindFirst("role")?.Value;

    var query = _context.Tickets
        .AsNoTracking()
        .AsQueryable();

    if (string.Equals(roleClaim, "Customer", StringComparison.OrdinalIgnoreCase))
      query = query.Where(t => t.CreatedByUserId == userId);
    else
      query = query.Where(t => t.AssignedToUserId == userId);

    var grouped = await query
        .GroupBy(t => t.Status)
        .Select(g => new { status = g.Key, count = g.Count() })
        .ToListAsync();

    int Get(TicketStatus s) => grouped.FirstOrDefault(x => x.status == s)?.count ?? 0;

    var open = Get(TicketStatus.Open);
    var inProgress = Get(TicketStatus.InProgress);
    var resolved = Get(TicketStatus.Resolved) + Get(TicketStatus.ResolvedOnBeta);
    var closed = Get(TicketStatus.Closed);

    var pending = Get(TicketStatus.Pending);

    return Ok(new
    {
      open,
      inProgress,
      pending,
      resolved,
      closed,
      total = open + inProgress + pending + resolved + closed
    });
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
    // Freshdesk-style visibility: agents can see all tickets in their org.
    // Assignment/group is ownership metadata, not list visibility gate.
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
          t.UpdatedAt,
          t.ResolvedAt,
          t.LastActivityAt,
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

  private static TimeZoneInfo? TryGetIst()
  {
    try { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
    catch { return null; }
  }

  private static (DateTime startUtc, DateTime endUtcExclusive) ToUtcRangeForIstDates(DateOnly start, DateOnly end)
  {
    var tz = TryGetIst();

    // Interpret start/end as IST calendar days.
    var startIst = new DateTime(start.Year, start.Month, start.Day, 0, 0, 0, DateTimeKind.Unspecified);
    var endNextIstDay = end.AddDays(1);
    var endIstExclusive = new DateTime(endNextIstDay.Year, endNextIstDay.Month, endNextIstDay.Day, 0, 0, 0, DateTimeKind.Unspecified);

    if (tz == null)
    {
      // Fallback: treat as UTC date range.
      return (DateTime.SpecifyKind(startIst, DateTimeKind.Utc), DateTime.SpecifyKind(endIstExclusive, DateTimeKind.Utc));
    }

    return (
      TimeZoneInfo.ConvertTimeToUtc(startIst, tz),
      TimeZoneInfo.ConvertTimeToUtc(endIstExclusive, tz)
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // GET /api/Tickets/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
  // Tickets for calendar range: includes items where CreatedAt OR UpdatedAt
  // OR LastActivityAt falls within the given IST date range.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  [HttpGet("calendar")]
  public async Task<IActionResult> GetCalendarTickets(
      [FromQuery] DateOnly start,
      [FromQuery] DateOnly end)
  {
    if (end < start)
      return BadRequest(new { message = "Invalid range" });

    // Keep it bounded.
    if ((end.ToDateTime(TimeOnly.MinValue) - start.ToDateTime(TimeOnly.MinValue)).TotalDays > 400)
      return BadRequest(new { message = "Range too large" });

    var userId = GetUserId();

    var roleClaim = User.FindFirst(
        "http://schemas.microsoft.com/ws/2008/06/" +
        "identity/claims/role")?.Value
        ?? User.FindFirst("role")?.Value;

    var (startUtc, endUtcExclusive) = ToUtcRangeForIstDates(start, end);

    var query = _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .AsSplitQuery()
        .AsQueryable();

    if (string.Equals(roleClaim, "Customer", StringComparison.OrdinalIgnoreCase))
    {
      query = query.Where(t => t.CreatedByUserId == userId);
    }

    query = query.Where(t =>
      (t.CreatedAt >= startUtc && t.CreatedAt < endUtcExclusive) ||
      (t.UpdatedAt != null && t.UpdatedAt >= startUtc && t.UpdatedAt < endUtcExclusive) ||
      (t.LastActivityAt != null && t.LastActivityAt >= startUtc && t.LastActivityAt < endUtcExclusive));

    var tickets = await query
      .OrderByDescending(t => t.UpdatedAt ?? t.LastActivityAt ?? t.CreatedAt)
      .Take(2000)
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
        t.UpdatedAt,
        t.ResolvedAt,
        t.LastActivityAt,
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
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.AgentGroup)
        .Include(t => t.Comments)
        .ThenInclude(c => c.User)
        .Include(t => t.Comments)
        .ThenInclude(c => c.EditedBy)
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
      ticket.FromEmail,
      ticket.FromName,
      ticket.InboundMessageId,
      CcEmails = ticket.CcEmails,
      BccEmails = ticket.BccEmails,
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
              c.Cc,
              c.Bcc,
              c.NotifiedTo,
              c.FromName,
              c.FromEmail,
              c.EditedAt,
              EditedBy = c.EditedBy == null ? null : new
              {
                c.EditedBy.Id,
                c.EditedBy.FullName,
                c.EditedBy.Email
              },
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
  [RequirePermission("tickets", PermissionAction.Add)]
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
      Priority = TryParseTicketPriority(
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

    if (!await IsMasterValueAllowedAsync(
        TicketPriorityField,
        ticket.Priority.ToString()))
    {
      return BadRequest(new
      {
        message = $"Priority {ticket.Priority} is not active in ticket master"
      });
    }

    var normalizedTicketType = (ticket.TicketType ?? "Support").Trim();
    if (!await IsMasterValueAllowedAsync(
        TicketTypeField,
        normalizedTicketType))
    {
      return BadRequest(new
      {
        message = $"Ticket Type {normalizedTicketType} is not active in ticket master"
      });
    }
    ticket.TicketType = normalizedTicketType;

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
  [RequirePermission("tickets", PermissionAction.Edit)]
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
    {
      var normalizedTicketType = dto.TicketType.Trim();
      if (!await IsMasterValueAllowedAsync(
          TicketTypeField,
          normalizedTicketType))
      {
        return BadRequest(new
        {
          message = $"Ticket Type {normalizedTicketType} is not active in ticket master"
        });
      }

      ticket.TicketType = normalizedTicketType;
    }
    if (dto.Tags != null)
      ticket.Tags = dto.Tags;

    if (!string.IsNullOrEmpty(dto.Priority) &&
      TryParseTicketPriority(
            dto.Priority, out var newP))
    {
      if (!await IsMasterValueAllowedAsync(
          TicketPriorityField,
          newP.ToString()))
      {
        return BadRequest(new
        {
          message = $"Priority {newP} is not active in ticket master"
        });
      }

      ticket.Priority = newP;
      ticket.SlaDeadline = _slaService
          .CalculateSlaDeadline(
              ticket.Priority, ticket.CreatedAt);
      ticket.SlaStatus = _slaService
          .GetSlaStatus(
              ticket.SlaDeadline, ticket.Status);
    }

    if (!string.IsNullOrEmpty(dto.Status) &&
      TryParseTicketStatus(
            dto.Status, out var newS))
    {
      if (!await IsMasterValueAllowedAsync(
          TicketStatusField,
          newS.ToString()))
      {
        return BadRequest(new
        {
          message = $"Status {newS} is not active in ticket master"
        });
      }

      if ((newS == TicketStatus.Resolved ||
           newS == TicketStatus.ResolvedOnBeta) &&
          ticket.Status != TicketStatus.Resolved &&
          ticket.Status != TicketStatus.ResolvedOnBeta)
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

    await NotifyWatchersAndAssigneeAsync(
      ticket,
      userId,
      "Ticket updated",
      $"Details were updated on #TN{ticket.TicketNumber}: {ticket.Title}");

    return Ok(new { message = "Updated successfully" });
  }

  [HttpDelete("{id}")]
  [RequirePermission("tickets", PermissionAction.Delete)]
  public async Task<IActionResult> Delete(Guid id)
  {
    // Soft delete only: ticket is moved to the Recycle Bin so an admin
    // can restore it within the org's retention window or purge it
    // permanently from RecycleBinController.
    var ticket = await _context.Tickets
        .FindAsync(id);
    if (ticket == null) return NotFound();

    if (ticket.IsDeleted)
      return Ok(new { message = "Already in recycle bin" });

    ticket.IsDeleted = true;
    ticket.DeletedAt = DateTime.UtcNow;
    ticket.DeletedByUserId = GetUserId();
    ticket.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    await _notificationService.CreateActivityAsync(
        GetUserId(),
        _tenantService.OrganizationId!.Value,
        "Deleted",
        $"Ticket moved to recycle bin: {ticket.Title}",
        "Ticket", ticket.Id);

    return Ok(new { message = "Moved to recycle bin" });
  }

  // â”€â”€ DETECT DUPLICATES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ MERGE TICKETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                $"ðŸ”€ This ticket has been " +
                $"merged into " +
                $"<strong>#TN{original.TicketNumber}" +
                $"</strong> â€” " +
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
                $"ðŸ”€ Ticket " +
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
            $"for future reference.</p>",
            organizationId: duplicate.OrganizationId);
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

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Status / Comments / Assign / Group / Priority / Type / Tags / LogTime /
  // Forward endpoints moved to TicketStatusController, TicketCommentsController,
  // TicketAssignmentsController (master refactor #21). Duplicates here caused
  // AmbiguousMatchException -> 500 -> CORS preflight failures.


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

  [HttpGet("{id}/watchers")]
  public async Task<IActionResult> GetWatchers(Guid id)
  {
    var ticket = await _context.Tickets
        .AsNoTracking()
        .FirstOrDefaultAsync(t => t.Id == id);
    if (ticket == null) return NotFound();

    var watcherRows = await _context.TicketWatchers
        .AsNoTracking()
        .Where(w => w.TicketId == id)
        .ToListAsync();

    var userIds = watcherRows
        .Select(w => w.UserId)
        .Distinct()
        .ToList();

    var users = await _context.Users
        .IgnoreQueryFilters()
        .AsNoTracking()
        .Where(u => userIds.Contains(u.Id))
        .Select(u => new
        {
          u.Id,
          u.FullName,
          u.Email,
          u.PhotoUrl
        })
        .ToListAsync();

    var userMap = users.ToDictionary(u => u.Id, u => u);

    var watchers = watcherRows
        .Select(w =>
        {
          userMap.TryGetValue(w.UserId, out var u);
          return new
          {
            w.UserId,
            FullName = u?.FullName ?? "Unknown",
            Email = u?.Email ?? string.Empty,
            PhotoUrl = u?.PhotoUrl,
            w.CreatedAt
          };
        })
        .OrderBy(x => x.FullName)
        .ToList();

    return Ok(watchers);
  }

  [HttpPost("{id}/watchers/me")]
  public async Task<IActionResult> AddMeAsWatcher(Guid id)
  {
    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t => t.Id == id);
    if (ticket == null) return NotFound();

    var userId = GetUserId();
    if (userId == Guid.Empty) return Unauthorized();

    var already = await _context.TicketWatchers
        .AnyAsync(w => w.TicketId == id && w.UserId == userId);
    if (already)
      return Ok(new { message = "Already watching" });

    _context.TicketWatchers.Add(new TicketWatcher
    {
      TicketId = id,
      UserId = userId,
      OrganizationId = ticket.OrganizationId,
      CreatedAt = DateTime.UtcNow
    });

    try
    {
      await _context.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
      return Ok(new { message = "Already watching" });
    }

    await _notificationService.CreateActivityAsync(
        userId,
        ticket.OrganizationId,
        "WatcherAdded",
        "Started watching this ticket",
        "Ticket",
        id);

    return Ok(new { message = "Now watching ticket" });
  }

  [HttpPost("{id}/watchers")]
  public async Task<IActionResult> AddWatcher(
      Guid id,
      [FromBody] AddWatcherDto dto)
  {
    if (dto.UserId == Guid.Empty)
      return BadRequest(new { message = "UserId is required" });

    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t => t.Id == id);
    if (ticket == null) return NotFound();

    var actorId = GetUserId();
    if (actorId == Guid.Empty) return Unauthorized();

    var targetUser = await _context.Users
        .IgnoreQueryFilters()
        .AsNoTracking()
        .FirstOrDefaultAsync(u =>
            u.Id == dto.UserId &&
            u.OrganizationId == ticket.OrganizationId);
    if (targetUser == null)
      return BadRequest(new { message = "User not found in organization" });

    var already = await _context.TicketWatchers
        .AnyAsync(w => w.TicketId == id && w.UserId == dto.UserId);
    if (already)
      return Ok(new { message = "Already watching" });

    _context.TicketWatchers.Add(new TicketWatcher
    {
      TicketId = id,
      UserId = dto.UserId,
      OrganizationId = ticket.OrganizationId,
      CreatedAt = DateTime.UtcNow
    });

    try
    {
      await _context.SaveChangesAsync();
    }
    catch (DbUpdateException)
    {
      return Ok(new { message = "Already watching" });
    }

    await _notificationService.CreateActivityAsync(
        actorId,
        ticket.OrganizationId,
        "WatcherAdded",
        $"Added watcher: {targetUser.FullName}",
        "Ticket",
        id);

    if (dto.UserId != actorId)
    {
      await _notificationService.CreateAsync(
          dto.UserId,
          ticket.OrganizationId,
          "Added as watcher",
          $"You were added as watcher on #TN{ticket.TicketNumber}: {ticket.Title}",
          "info",
          id);
    }

    return Ok(new { message = "Watcher added" });
  }

  [HttpDelete("{id}/watchers/{userId}")]
  public async Task<IActionResult> RemoveWatcher(Guid id, Guid userId)
  {
    var ticket = await _context.Tickets
        .FirstOrDefaultAsync(t => t.Id == id);
    if (ticket == null) return NotFound();

    var actorId = GetUserId();
    if (actorId == Guid.Empty) return Unauthorized();

    var watcher = await _context.TicketWatchers
        .FirstOrDefaultAsync(w =>
            w.TicketId == id &&
            w.UserId == userId);
    if (watcher == null)
      return Ok(new { message = "Watcher removed" });

    _context.TicketWatchers.Remove(watcher);
    await _context.SaveChangesAsync();

    var action = userId == actorId
        ? "Stopped watching this ticket"
        : "Removed a watcher from this ticket";

    await _notificationService.CreateActivityAsync(
        actorId,
        ticket.OrganizationId,
        "WatcherRemoved",
        action,
        "Ticket",
        id);

    return Ok(new { message = "Watcher removed" });
  }

  private async Task NotifyWatchersAndAssigneeAsync(
      Ticket ticket,
      Guid actorUserId,
      string title,
      string message)
  {
    var recipients = new HashSet<Guid>();
    if (ticket.AssignedToUserId.HasValue)
      recipients.Add(ticket.AssignedToUserId.Value);

    var watcherIds = await _context.TicketWatchers
        .Where(w => w.TicketId == ticket.Id)
        .Select(w => w.UserId)
        .ToListAsync();

    foreach (var watcherId in watcherIds)
      recipients.Add(watcherId);

    recipients.Remove(actorUserId);
    if (recipients.Count == 0) return;

    foreach (var recipientId in recipients)
    {
      try
      {
        await _notificationService.CreateAsync(
            recipientId,
            ticket.OrganizationId,
            title,
            message,
            "info",
            ticket.Id);
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex, "Watcher notification failed for {UserId}", recipientId);
      }
    }

    var emailRecipients = await _context.Users
        .IgnoreQueryFilters()
        .Where(u => recipients.Contains(u.Id) && !string.IsNullOrWhiteSpace(u.Email))
        .Select(u => new { u.Email })
        .ToListAsync();

    foreach (var recipient in emailRecipients)
    {
      try
      {
        await _emailService.SendAsync(
            recipient.Email!,
            title,
            $"<p>{System.Net.WebUtility.HtmlEncode(message)}</p>",
            organizationId: ticket.OrganizationId,
            ticketNumberTag: $"#TN{ticket.TicketNumber}");
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex, "Watcher email failed for {Email}", recipient.Email);
      }
    }
  }

  [HttpPost("bulk-update")]
  [RequirePermission("tickets", PermissionAction.Edit)]
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
          TryParseTicketStatus(
              dto.Status, out var s))
      {
        if (!await IsMasterValueAllowedAsync(
            TicketStatusField,
            s.ToString()))
        {
          return BadRequest(new
          {
            message = $"Status {s} is not active in ticket master"
          });
        }

        t.Status = s;
      }

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
  [RequirePermission("tickets", PermissionAction.Export)]
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
      TryParseTicketStatus(
            status, out var sFilter))
      query = query.Where(t =>
          t.Status == sFilter);

    if (!string.IsNullOrEmpty(priority) &&
        priority != "All" &&
      TryParseTicketPriority(
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
      TryParseTicketStatus(
            status, out var sf))
      tickets = tickets.Where(t =>
          t.Status == sf);

    if (!string.IsNullOrEmpty(priority) &&
        priority != "All" &&
      TryParseTicketPriority(
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


