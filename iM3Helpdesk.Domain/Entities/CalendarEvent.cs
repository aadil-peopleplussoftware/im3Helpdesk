// FILE: iM3Helpdesk.Domain/Entities/CalendarEvent.cs
// REPLACE the existing file completely

namespace iM3Helpdesk.Domain.Entities;

public class CalendarEvent
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Title { get; set; } = string.Empty;
  public string? Description { get; set; }
  public DateTime StartDate { get; set; }
  public DateTime? EndDate { get; set; }
  public bool AllDay { get; set; }

  /// <summary>reminder | event | meeting | deadline | ticket</summary>
  public string Type { get; set; } = "event";

  /// <summary>low | medium | high</summary>
  public string Priority { get; set; } = "medium";

  public Guid? TicketId { get; set; }
  public bool IsCompleted { get; set; }

  /// <summary>Minutes before StartDate to send reminder email</summary>
  public int? ReminderMinutes { get; set; }

  public string? Color { get; set; }

  // ── Multi-tenant ──────────────────────────────────
  public Guid OrganizationId { get; set; }
  public Guid CreatedByUserId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

  // ── Attendees (comma-separated emails) ────────────
  // e.g. "aadil@gmail.com,ruchi@company.com,mbhatt@company.com"
  public string? AttendeeEmails { get; set; }

  // ── Reminder tracking ─────────────────────────────
  // Prevents sending duplicate reminder emails
  public bool ReminderSent { get; set; } = false;
  public DateTime? ReminderSentAt { get; set; }
}
