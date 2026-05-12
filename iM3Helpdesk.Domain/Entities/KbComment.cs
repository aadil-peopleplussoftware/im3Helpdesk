namespace iM3Helpdesk.Domain.Entities;

public class KbComment
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public Guid ArticleId { get; set; }
  public Guid UserId { get; set; }
  public string Text { get; set; } = string.Empty;
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? UpdatedAt { get; set; }
  public Guid OrganizationId { get; set; }
  public KbArticle? Article { get; set; }
  public User? User { get; set; }
}
