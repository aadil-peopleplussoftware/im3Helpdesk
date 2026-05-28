// FILE: iM3Helpdesk.API/Controllers/CalendarEventsController.cs
// REPLACE the existing file completely

using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CalendarEventsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;
  private readonly IEmailService _emailService;

  public CalendarEventsController(
      ApplicationDbContext context,
      ICurrentTenantService tenant,
      IEmailService emailService)
  {
    _context = context;
    _tenant = tenant;
    _emailService = emailService;
  }

  // ── Helper ───────────────────────────────────────────
  private bool TryGetUserId(out Guid userId)
  {
    var claim = User.FindFirst(
        System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
    return Guid.TryParse(claim, out userId);
  }

  private List<string> ParseAttendees(string? attendeeEmails)
  {
    if (string.IsNullOrWhiteSpace(attendeeEmails))
      return new List<string>();
    return attendeeEmails
        .Split(',', StringSplitOptions.RemoveEmptyEntries)
        .Select(e => e.Trim().ToLower())
        .Where(e => e.Contains('@'))
        .Distinct()
        .ToList();
  }

  // ── GET all events for current user ──────────────────
  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var events = await _context.CalendarEvents
        .AsNoTracking()
        .Where(e => e.CreatedByUserId == userId)
        .OrderBy(e => e.StartDate)
        .Select(e => new
        {
          e.Id,
          e.Title,
          e.Description,
          e.StartDate,
          e.EndDate,
          e.AllDay,
          e.Type,
          e.Priority,
          e.TicketId,
          e.IsCompleted,
          e.ReminderMinutes,
          e.Color,
          e.AttendeeEmails,
          e.ReminderSent,
          e.CreatedAt
        })
        .ToListAsync();

    return Ok(events);
  }

  // ── GET single event ─────────────────────────────────
  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var ev = await _context.CalendarEvents
        .AsNoTracking()
        .FirstOrDefaultAsync(e =>
            e.Id == id &&
            e.CreatedByUserId == userId);

    if (ev == null) return NotFound();
    return Ok(ev);
  }

  // ── POST create event ─────────────────────────────────
  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CalendarEventUpsertDto dto)
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    if (string.IsNullOrWhiteSpace(dto.Title))
      return BadRequest(new { message = "Title is required" });

    var orgId = _tenant.OrganizationId;
    if (orgId == null)
      return BadRequest(new { message = "Organization not found" });

    // Get creator info for invite emails
    var creator = await _context.Users
        .AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == userId);

    var org = await _context.Organizations
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == orgId);
        var organizationId = org?.Id ?? orgId.Value;

    var ev = new iM3Helpdesk.Domain.Entities.CalendarEvent
    {
      Id = dto.Id != Guid.Empty ? dto.Id : Guid.NewGuid(),
      Title = dto.Title.Trim(),
      Description = dto.Description,
      StartDate = dto.StartDate.ToUniversalTime(),
      EndDate = dto.EndDate?.ToUniversalTime(),
      AllDay = dto.AllDay,
      Type = dto.Type ?? "event",
      Priority = dto.Priority ?? "medium",
      TicketId = dto.TicketId,
      IsCompleted = false,
      ReminderMinutes = dto.ReminderMinutes,
      Color = dto.Color,
      AttendeeEmails = NormalizeAttendees(dto.AttendeeEmails),
      ReminderSent = false,
      OrganizationId = orgId.Value,
      CreatedByUserId = userId,
      CreatedAt = DateTime.UtcNow
    };

    _context.CalendarEvents.Add(ev);
    await _context.SaveChangesAsync();

    // ── Send invite emails to attendees ───────────────
    var attendees = ParseAttendees(ev.AttendeeEmails);
    if (attendees.Any() && creator != null)
    {
      await SendInviteEmailsAsync(
          ev, attendees,
          creator.FullName,
          org?.Name ?? "DeskMate",
          organizationId);
    }

    return Ok(ev);
  }

  // ── PUT update event ──────────────────────────────────
  [HttpPut("{id}")]
  public async Task<IActionResult> Update(
      Guid id,
      [FromBody] CalendarEventUpsertDto dto)
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var ev = await _context.CalendarEvents
        .FirstOrDefaultAsync(e =>
            e.Id == id &&
            e.CreatedByUserId == userId);

    if (ev == null)
      return NotFound(new { message = "Event not found" });

    // Track what changed for emails
    var oldAttendees = ParseAttendees(ev.AttendeeEmails);
    var oldStartDate = ev.StartDate;
    bool dateChanged = dto.StartDate != default &&
                       dto.StartDate.ToUniversalTime() != ev.StartDate;

    // Update fields
    if (!string.IsNullOrWhiteSpace(dto.Title))
      ev.Title = dto.Title.Trim();
    ev.Description = dto.Description ?? ev.Description;
    ev.AllDay = dto.AllDay;
    ev.Type = dto.Type ?? ev.Type;
    ev.Priority = dto.Priority ?? ev.Priority;
    ev.TicketId = dto.TicketId ?? ev.TicketId;
    ev.IsCompleted = dto.IsCompleted;
    ev.Color = dto.Color ?? ev.Color;
    ev.AttendeeEmails = NormalizeAttendees(dto.AttendeeEmails) ?? ev.AttendeeEmails;
    ev.ReminderMinutes = dto.ReminderMinutes ?? ev.ReminderMinutes;

    // Reset reminder flag if start date changed
    if (dto.StartDate != default)
    {
      ev.StartDate = dto.StartDate.ToUniversalTime();
      if (dateChanged) ev.ReminderSent = false;
    }
    if (dto.EndDate.HasValue)
      ev.EndDate = dto.EndDate.Value.ToUniversalTime();

    await _context.SaveChangesAsync();

    // ── Send update emails to ALL current attendees ───
    var newAttendees = ParseAttendees(ev.AttendeeEmails);
    var creator = await _context.Users.AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == userId);
    var org = await _context.Organizations.AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == _tenant.OrganizationId);
        var organizationId = org?.Id ?? _tenant.OrganizationId;

    if (newAttendees.Any() && creator != null && dateChanged)
    {
      // Notify all attendees of the time change
      foreach (var email in newAttendees)
      {
        var name = email.Split('@')[0];
        _ = Task.Run(async () =>
        {
          try
          {
            await _emailService.SendCalendarEventUpdatedAsync(
                email, name, ev.Title, ev.StartDate,
                "updated", org?.Name ?? "DeskMate", organizationId);
          }
          catch { }
        });
      }
    }

    // ── Send invite to NEW attendees only ─────────────
    var brandNewAttendees = newAttendees
        .Except(oldAttendees, StringComparer.OrdinalIgnoreCase)
        .ToList();

    if (brandNewAttendees.Any() && creator != null)
    {
      await SendInviteEmailsAsync(
          ev, brandNewAttendees,
          creator.FullName,
          org?.Name ?? "DeskMate", organizationId);
    }

    return Ok(ev);
  }

  // ── DELETE event ──────────────────────────────────────
  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var ev = await _context.CalendarEvents
        .FirstOrDefaultAsync(e =>
            e.Id == id &&
            e.CreatedByUserId == userId);

    if (ev == null) return NotFound();

    // Notify attendees of cancellation before deleting
    var attendees = ParseAttendees(ev.AttendeeEmails);
    var org = await _context.Organizations.AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == _tenant.OrganizationId);
        var organizationId = org?.Id ?? _tenant.OrganizationId;

    if (attendees.Any())
    {
      foreach (var email in attendees)
      {
        var name = email.Split('@')[0];
        _ = Task.Run(async () =>
        {
          try
          {
            await _emailService.SendCalendarEventUpdatedAsync(
                email, name, ev.Title, ev.StartDate,
                "cancelled", org?.Name ?? "DeskMate", organizationId);
          }
          catch { }
        });
      }
    }

    _context.CalendarEvents.Remove(ev);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Deleted" });
  }

  // ── GET upcoming reminders (for polling) ──────────────
  [HttpGet("upcoming-reminders")]
  public async Task<IActionResult> GetUpcomingReminders()
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var now = DateTime.UtcNow;
    var cutoff = now.AddMinutes(60);

    var events = await _context.CalendarEvents
        .AsNoTracking()
        .Where(e =>
            e.CreatedByUserId == userId &&
            !e.IsCompleted &&
            e.ReminderMinutes != null)
        .ToListAsync();

    var due = events
        .Where(e =>
        {
          var reminderTime = e.StartDate
                  .AddMinutes(-(e.ReminderMinutes ?? 0));
          return reminderTime >= now && reminderTime <= cutoff;
        })
        .OrderBy(e => e.StartDate)
        .ToList();

    return Ok(due);
  }

  // ── POST send reminder manually ───────────────────────
  // Called from frontend "Send Reminder Now" button
  [HttpPost("{id}/send-reminder")]
  public async Task<IActionResult> SendReminderNow(Guid id)
  {
    if (!TryGetUserId(out var userId))
      return Unauthorized();

    var ev = await _context.CalendarEvents
        .FirstOrDefaultAsync(e =>
            e.Id == id &&
            e.CreatedByUserId == userId);

    if (ev == null)
      return NotFound(new { message = "Event not found" });

    var creator = await _context.Users.AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == userId);

    var org = await _context.Organizations.AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == _tenant.OrganizationId);
        var organizationId = org?.Id ?? _tenant.OrganizationId;

    var orgName = org?.Name ?? "DeskMate";

    // Get ticket number if linked
    string? ticketNumber = null;
    if (ev.TicketId.HasValue)
    {
      var ticket = await _context.Tickets.AsNoTracking()
          .FirstOrDefaultAsync(t => t.Id == ev.TicketId.Value);
      ticketNumber = ticket?.TicketNumber.ToString();
    }

    // Send to creator
    if (creator != null)
    {
      try
      {
        await _emailService.SendCalendarReminderAsync(
            creator.Email,
            creator.FullName,
            ev.Title,
            ev.Type,
            ev.Description ?? "",
            ev.StartDate,
            ev.ReminderMinutes ?? 30,
            ticketNumber,
            orgName, 
            organizationId);
      }
      catch { }
    }

    // Send to all attendees
    var attendees = ParseAttendees(ev.AttendeeEmails);
    foreach (var email in attendees)
    {
      var name = email.Split('@')[0];
      _ = Task.Run(async () =>
      {
        try
        {
          await _emailService.SendCalendarReminderAsync(
              email, name,
              ev.Title, ev.Type,
              ev.Description ?? "",
              ev.StartDate,
              ev.ReminderMinutes ?? 30,
              ticketNumber,
              orgName,
              organizationId);
        }
        catch { }
      });
    }

    // Mark reminder as sent
    ev.ReminderSent = true;
    ev.ReminderSentAt = DateTime.UtcNow;
    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Reminder sent",
      sentTo = (attendees.Count + 1),
      sentAt = ev.ReminderSentAt
    });
  }

  // ── Private: send invite to list of emails ────────────
  private async Task SendInviteEmailsAsync(
      iM3Helpdesk.Domain.Entities.CalendarEvent ev,
      List<string> attendeeEmails,
      string organizerName,
      string orgName,
      Guid? organizationId)
  {
    foreach (var email in attendeeEmails)
    {
      var name = email.Split('@')[0]; // basic name from email
      _ = Task.Run(async () =>
      {
        try
        {
          await _emailService.SendCalendarInviteAsync(
              email,
              name,
              ev.Title,
              ev.Type,
              ev.Description ?? "",
              ev.StartDate,
              ev.EndDate,
              organizerName,
              orgName,
              organizationId);
        }
        catch { }
      });
    }
  }

  // ── Private: normalize attendee emails string ─────────
  private static string? NormalizeAttendees(string? raw)
  {
    if (string.IsNullOrWhiteSpace(raw)) return null;
    var emails = raw
        .Split(',', StringSplitOptions.RemoveEmptyEntries)
        .Select(e => e.Trim().ToLower())
        .Where(e => e.Contains('@'))
        .Distinct();
    var result = string.Join(",", emails);
    return string.IsNullOrEmpty(result) ? null : result;
  }
}

// ── DTOs ─────────────────────────────────────────────────────
public class CalendarEventUpsertDto
{
  public Guid Id { get; set; }
  public string? Title { get; set; }
  public string? Description { get; set; }
  public DateTime StartDate { get; set; }
  public DateTime? EndDate { get; set; }
  public bool AllDay { get; set; }
  public string? Type { get; set; }
  public string? Priority { get; set; }
  public Guid? TicketId { get; set; }
  public bool IsCompleted { get; set; }
  public int? ReminderMinutes { get; set; }
  public string? Color { get; set; }
  public string? AttendeeEmails { get; set; }  // "a@b.com,c@d.com"
}
