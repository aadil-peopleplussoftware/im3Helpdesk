namespace iM3Helpdesk.Domain.Entities;

public class KbReaction
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid ArticleId { get; set; }
  public Guid UserId { get; set; }
  public string ReactionType { get; set; } = "like";
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public Guid OrganizationId { get; set; }
  public KbArticle? Article { get; set; }
  public User? User { get; set; }
}
