namespace iM3Helpdesk.Domain.Entities;

public class CommentReaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CommentId { get; set; }
    public Guid UserId { get; set; }
    /// <summary>One of: like | heart | laugh | wow | sad | dislike</summary>
    public string ReactionType { get; set; } = "like";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid OrganizationId { get; set; }

    public TicketComment? Comment { get; set; }
    public User? User { get; set; }
}
