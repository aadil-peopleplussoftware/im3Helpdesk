namespace iM3Helpdesk.Domain.Entities;

public class TicketComment
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid TicketId { get; set; }
  /// <summary>
  /// Null when the comment was authored by an unregistered customer
  /// (typically an inbound email reply). Sender identity is then carried
  /// in <see cref="FromEmail"/> and <see cref="FromName"/>.
  /// </summary>
  public Guid? UserId { get; set; }
  /// <summary>Sender email when UserId is null (customer reply via email).</summary>
  public string? FromEmail { get; set; }
  /// <summary>Sender display name when UserId is null.</summary>
  public string? FromName { get; set; }
  public string Comment { get; set; } = string.Empty;
  public bool IsInternal { get; set; } = false;
  public Guid OrganizationId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public string? EmailMessageId { get; set; }
  public string? Source { get; set; } = "web";

  // ── Email metadata (reply / note recipients) ─────────────────────
  // Comma-separated email addresses; null when not applicable.
  public string? Cc { get; set; }
  public string? Bcc { get; set; }
  // For private notes: comma-separated emails of users notified.
  public string? NotifiedTo { get; set; }

  // RFC 5322 threading. For outbound replies we store the In-Reply-To
  // header so we can reconstruct the conversation chain on display
  // and pass `References` back into MimeKit on the next outbound mail.
  public string? InReplyTo { get; set; }
  public string? References { get; set; }

  public User? User { get; set; }
  public Ticket? Ticket { get; set; }
}
