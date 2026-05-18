using iM3Helpdesk.Domain.Interfaces;
using System.Xml.Linq;

namespace iM3Helpdesk.Domain.Entities;

public class KbArticle : IMustHaveTenant
{
  public Guid Id { get; set; } = Guid.NewGuid();
  public string Title { get; set; } = string.Empty;
  public string Content { get; set; } = string.Empty;
  public string Category { get; set; } = string.Empty;
  public string Tags { get; set; } = string.Empty;
  public bool IsPublished { get; set; } = false;
  public int ViewCount { get; set; } = 0;
  public Guid OrganizationId { get; set; }
  public Guid CreatedByUserId { get; set; }
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime? UpdatedAt { get; set; }
  public string MediaUrl { get; set; } = string.Empty;
  public string MediaType { get; set; } = "none";
  public User? CreatedBy { get; set; }
  public ICollection<KbReaction> Reactions { get; set; } = new List<KbReaction>();
  public ICollection<KbComment> Comments { get; set; } = new List<KbComment>();
}
