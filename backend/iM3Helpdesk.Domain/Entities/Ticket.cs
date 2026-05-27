using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Domain.Interfaces;

namespace iM3Helpdesk.Domain.Entities;

public class Ticket : IMustHaveTenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? FromEmail { get; set; }
    /// <summary>Sender display name when ticket was created from email (CreatedByUserId is null).</summary>
    public string? FromName { get; set; }
    /// <summary>
    /// Comma-separated Cc recipients captured from the original inbound email and
    /// appended (de-duplicated) on each subsequent inbound reply. Used to pre-fill
    /// the Cc list when an agent replies so the original recipients stay in the loop.
    /// Our own org support addresses and the ticket sender are excluded.
    /// </summary>
    public string? CcEmails { get; set; }
    /// <summary>RFC-5322 Message-Id of the original inbound email — anchor for the reply thread.</summary>
    public string? InboundMessageId { get; set; }
    public string Category { get; set; } = string.Empty;
    public TicketStatus Status { get; set; } = TicketStatus.Open;
    public TicketPriority Priority { get; set; } = TicketPriority.Medium;
    public Guid OrganizationId { get; set; }
    /// <summary>Null when ticket originated from an inbound email (no registered user).</summary>
    public Guid? CreatedByUserId { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? SlaDeadline { get; set; }
    public bool IsSlaBreached { get; set; } = false;
    public string? SlaStatus { get; set; }
    public string Tags { get; set; } = string.Empty;
    public int TimeSpentMinutes { get; set; } = 0;
    public DateTime? LastActivityAt { get; set; }
    public string TicketType { get; set; } = "Support";
    public Guid? AgentGroupId { get; set; }
    public AgentGroup? AgentGroup { get; set; }
    public int TicketNumber { get; set; }
    public User? CreatedBy { get; set; }
    public User? AssignedTo { get; set; }
    public Organization? Organization { get; set; }
    public ICollection<TicketComment> Comments { get; set; } = new List<TicketComment>();
}
