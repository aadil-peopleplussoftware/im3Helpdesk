namespace iM3Helpdesk.Application.DTOs.Tickets;

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
