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
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketsController : ControllerBase
{
  private const string TicketTypeField = "TicketType";
  private const string TicketStatusField = "TicketStatus";
  private const string TicketPriorityField = "TicketPriority";

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

  private static string? GetTicketRecipientEmail(Ticket ticket)
  {
    if (!string.IsNullOrWhiteSpace(ticket.FromEmail))
      return ticket.FromEmail.Trim();
 
    return ticket.CreatedBy?.Email;
  }

  private static string FormatSize(long bytes)
  {
    if (bytes < 1024) return $"{bytes} B";
    if (bytes < 1048576)
      return $"{bytes / 1024} KB";
    return $"{bytes / 1048576} MB";
  }

  private async Task<bool> IsMasterValueAllowedAsync(
      string field,
      string value)
  {
    var hasRows = await _context.TicketFieldMasters
        .AnyAsync(x => x.Field == field);

    if (!hasRows)
      return true;

    return await _context.TicketFieldMasters
        .AnyAsync(x =>
            x.Field == field &&
            x.IsActive &&
            x.Value == value);
  }

  private static bool TryParseTicketStatus(string? input, out TicketStatus status)
  {
    status = default;
    if (string.IsNullOrWhiteSpace(input))
      return false;

    var value = input.Trim();

    if (Enum.TryParse<TicketStatus>(value, true, out var parsed) &&
        Enum.IsDefined(parsed))
    {
      status = parsed;
      return true;
    }

    var compact = CompactEnumToken(value);
    if (compact == "close")
    {
      status = TicketStatus.Closed;
      return true;
    }

    foreach (var name in Enum.GetNames<TicketStatus>())
    {
      if (CompactEnumToken(name) == compact)
      {
        status = Enum.Parse<TicketStatus>(name, true);
        return true;
      }
    }

    return false;
  }

  private static bool TryParseTicketPriority(string? input, out TicketPriority priority)
  {
    priority = default;
    if (string.IsNullOrWhiteSpace(input))
      return false;

    var value = input.Trim();

    if (Enum.TryParse<TicketPriority>(value, true, out var parsed) &&
        Enum.IsDefined(parsed))
    {
      priority = parsed;
      return true;
    }

    var compact = CompactEnumToken(value);
    if (compact == "urgent")
    {
      priority = TicketPriority.Critical;
      return true;
    }

    foreach (var name in Enum.GetNames<TicketPriority>())
    {
      if (CompactEnumToken(name) == compact)
      {
        priority = Enum.Parse<TicketPriority>(name, true);
        return true;
      }
    }

    return false;
  }

  private static string CompactEnumToken(string value)
  {
    var sb = new StringBuilder(value.Length);
    foreach (var ch in value)
    {
      if (char.IsLetterOrDigit(ch))
        sb.Append(char.ToLowerInvariant(ch));
    }

    return sb.ToString();
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

  // ─────────────────────────────────────
  // GET /api/Tickets/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
  // Tickets for calendar range: includes items where CreatedAt OR UpdatedAt
  // OR LastActivityAt falls within the given IST date range.
  // ─────────────────────────────────────
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
    else if (string.Equals(roleClaim, "Customer", StringComparison.OrdinalIgnoreCase))
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

    return Ok(new { message = "Updated successfully" });
  }

  [HttpDelete("{id}")]
  [Authorize(Roles = "CompanyAdmin,SuperAdmin")]
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
    if (!TryParseTicketStatus(
        statusStr, out var newStatus))
      return BadRequest(new
      {
        message = $"Invalid status: {statusStr}"
      });

    if (!await IsMasterValueAllowedAsync(
        TicketStatusField,
        newStatus.ToString()))
    {
      return BadRequest(new
      {
        message = $"Status {newStatus} is not active in ticket master"
      });
    }

    ticket.Status = newStatus;
    ticket.UpdatedAt = DateTime.UtcNow;

    if ((newStatus == TicketStatus.Resolved ||
         newStatus == TicketStatus.ResolvedOnBeta) &&
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
            html,
            organizationId: ticket.OrganizationId);
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

    // ── Threading: anchor on Ticket.InboundMessageId, then chain through comments ──
    var commentMsgIds = await _context.TicketComments
        .Where(c => c.TicketId == id &&
                    !string.IsNullOrEmpty(c.EmailMessageId))
        .OrderBy(c => c.CreatedAt)
        .Select(c => c.EmailMessageId!)
        .ToListAsync();

    var referenceChain = new List<string>();
    if (!string.IsNullOrWhiteSpace(ticket.InboundMessageId))
      referenceChain.Add(ticket.InboundMessageId);
    referenceChain.AddRange(commentMsgIds);

    // In-Reply-To = most recent message in the chain
    var lastMsgId = referenceChain.LastOrDefault();

    // ── Resolve notified users (notes AND replies) ──
    string? notifiedTo = null;
    var notifyMailList = new List<string>();
    var notifyUserIds = new List<Guid>();
    if (dto.NotifyUserIds is { Count: > 0 })
    {
      var users = await _context.Users
          .Where(u => dto.NotifyUserIds.Contains(u.Id))
          .Select(u => new { u.Id, u.Email })
          .ToListAsync();
      notifyMailList.AddRange(users.Select(u => u.Email));
      notifyUserIds.AddRange(users.Select(u => u.Id));
    }
    if (dto.NotifyEmails is { Count: > 0 })
      notifyMailList.AddRange(dto.NotifyEmails);
    notifyMailList = notifyMailList
        .Where(e => !string.IsNullOrWhiteSpace(e))
        .Select(e => e.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();
    if (notifyMailList.Count > 0)
      notifiedTo = string.Join(",", notifyMailList);

    var ccList = (dto.Cc ?? new List<string>())
        .Where(e => !string.IsNullOrWhiteSpace(e))
        .Select(e => e.Trim()).ToList();
    var bccList = (dto.Bcc ?? new List<string>())
        .Where(e => !string.IsNullOrWhiteSpace(e))
        .Select(e => e.Trim()).ToList();

    var comment = new TicketComment
    {
      TicketId = id,
      UserId = userId,
      Comment = dto.Comment,
      IsInternal = dto.IsInternal,
      Source = "web",
      OrganizationId =
            _tenantService.OrganizationId!.Value,
      Cc = ccList.Count > 0 ? string.Join(",", ccList) : null,
      Bcc = bccList.Count > 0 ? string.Join(",", bccList) : null,
      NotifiedTo = notifiedTo,
      InReplyTo = !dto.IsInternal ? lastMsgId : null,
      References = !dto.IsInternal && referenceChain.Count > 0
          ? string.Join(" ", referenceChain) : null
    };

    _context.TicketComments.Add(comment);

    // Update ticket activity time
    ticket.LastActivityAt = DateTime.UtcNow;
    ticket.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    // ✅ Send email if public reply
    if (!dto.IsInternal)
    {
      var replyTo = !string.IsNullOrWhiteSpace(ticket.FromEmail)
          ? ticket.FromEmail.Trim()
          : ticket.CreatedBy?.Email;
      if (!string.IsNullOrWhiteSpace(replyTo))
      {
        try
        {
          var outboundMsgId = await _emailService.SendReplyAsync(
              replyTo,
              ticket.Title,
              dto.Comment,
              $"#TN{ticket.TicketNumber}",
              agent?.FullName ?? "Support",
              agent?.Signature ?? "",
              ticket.OrganizationId,
              cc: ccList,
              bcc: bccList,
              inReplyTo: lastMsgId,
              references: referenceChain);

          if (!string.IsNullOrEmpty(outboundMsgId))
          {
            comment.EmailMessageId = outboundMsgId;
            await _context.SaveChangesAsync();
          }
        }
        catch (Exception ex)
        {
          _logger.LogWarning(ex,
              "Reply email failed");
        }
      }
    }

    // ✅ Notify mentioned agents for private notes
    if (dto.IsInternal && notifyMailList.Count > 0)
    {
      foreach (var em in notifyMailList)
      {
        try
        {
          await _emailService.SendAsync(
              em,
              $"🔒 Note on #TN{ticket.TicketNumber}: {ticket.Title}",
              $"<p><strong>{agent?.FullName ?? "Agent"}</strong> added a private note:</p>" +
              $"<blockquote style='border-left:3px solid #f59e0b;padding:8px 12px;background:#fff7ed'>{dto.Comment}</blockquote>",
              organizationId: ticket.OrganizationId,
              ticketNumberTag: $"#TN{ticket.TicketNumber}");
        }
        catch (Exception ex)
        {
          _logger.LogWarning(ex, "Note notify email failed for {Email}", em);
        }
      }
    }

    // ✅ In-app notification for every mentioned user (note or reply)
    if (notifyUserIds.Count > 0)
    {
      var actorName = agent?.FullName ?? "An agent";
      var kindLabel = dto.IsInternal ? "private note" : "reply";
      foreach (var uid in notifyUserIds.Distinct())
      {
        if (uid == userId) continue; // don't notify self
        try
        {
          await _notificationService.CreateAsync(
              uid,
              ticket.OrganizationId,
              "You were mentioned",
              $"{actorName} mentioned you in a {kindLabel} on #TN{ticket.TicketNumber}: {ticket.Title}",
              "info", ticket.Id);
        }
        catch (Exception ex)
        {
          _logger.LogWarning(ex, "Mention notification failed for {UserId}", uid);
        }
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
                html,
                organizationId:ticket.OrganizationId);
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

    if (!TryParseTicketPriority(
        dto.Priority, out var newP))
      return BadRequest();

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
      // Identify the forwarding agent for both the From header
      // (display name) and a visible attribution line in the body.
      var agentId = GetUserId();
      var agent = await _context.Users
          .Where(u => u.Id == agentId)
          .Select(u => new { u.FullName, u.Email })
          .FirstOrDefaultAsync();
      var agentName = agent?.FullName ?? "Support";

      var html = $@"
<div style='font-family:Arial;max-width:600px'>
  <p style='color:#374151;font-size:13px;margin:0 0 12px'>
    Forwarded by <strong>{System.Net.WebUtility.HtmlEncode(agentName)}</strong>
  </p>
  <p>A support ticket has been forwarded to you:</p>
  <h3>{ticket.Title}</h3>
  <p><strong>Ticket ID:</strong>
    #TN{ticket.TicketNumber}</p>
  <hr/>
  <div>{dto.Message ?? ticket.Description}</div>
</div>";

      // ── Threading: anchor on Ticket.InboundMessageId, then chain through comments ──
      var commentMsgIds = await _context.TicketComments
          .Where(c => c.TicketId == id &&
                      !string.IsNullOrEmpty(c.EmailMessageId))
          .OrderBy(c => c.CreatedAt)
          .Select(c => c.EmailMessageId!)
          .ToListAsync();

      var referenceChain = new List<string>();
      if (!string.IsNullOrWhiteSpace(ticket.InboundMessageId))
        referenceChain.Add(ticket.InboundMessageId);
      referenceChain.AddRange(commentMsgIds);
      var lastMsgId = referenceChain.LastOrDefault();

      var outboundMsgId = await _emailService.SendForwardAsync(
          dto.ToEmail,
          $"[Forwarded] {ticket.Title}" +
          $" #TN{ticket.TicketNumber}",
          html,
          organizationId: ticket.OrganizationId,
          cc: dto.Cc,
          bcc: dto.Bcc,
          inReplyTo: lastMsgId,
          references: referenceChain,
          fromDisplayName: agentName);

      // ── Persist forward as a visible conversation entry ──
      var ccCsv = (dto.Cc != null && dto.Cc.Count > 0)
          ? string.Join(",", dto.Cc
              .Where(e => !string.IsNullOrWhiteSpace(e))
              .Select(e => e.Trim()))
          : null;
      var bccCsv = (dto.Bcc != null && dto.Bcc.Count > 0)
          ? string.Join(",", dto.Bcc
              .Where(e => !string.IsNullOrWhiteSpace(e))
              .Select(e => e.Trim()))
          : null;

      var forwardComment = new TicketComment
      {
        TicketId = id,
        UserId = agentId,
        Comment = dto.Message ?? ticket.Description ?? string.Empty,
        IsInternal = false,
        Source = "forward",
        OrganizationId = ticket.OrganizationId,
        NotifiedTo = dto.ToEmail,
        Cc = string.IsNullOrEmpty(ccCsv) ? null : ccCsv,
        Bcc = string.IsNullOrEmpty(bccCsv) ? null : bccCsv,
        EmailMessageId = outboundMsgId,
        InReplyTo = lastMsgId,
        References = referenceChain.Count > 0
            ? string.Join(" ", referenceChain) : null
      };
      _context.TicketComments.Add(forwardComment);

      ticket.LastActivityAt = DateTime.UtcNow;
      ticket.UpdatedAt = DateTime.UtcNow;
      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Forwarded successfully",
        commentId = forwardComment.Id
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

  // Public reply CC / BCC (comma-separated emails OR list).
  public List<string>? Cc { get; set; }
  public List<string>? Bcc { get; set; }

  // Private note: who was notified (user IDs to look up agents).
  public List<Guid>? NotifyUserIds { get; set; }
  // Optional ad-hoc email recipients for note notifications.
  public List<string>? NotifyEmails { get; set; }
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
  public List<string>? Cc { get; set; }
  public List<string>? Bcc { get; set; }
}
