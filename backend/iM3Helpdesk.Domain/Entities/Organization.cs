
namespace iM3Helpdesk.Domain.Entities;

public class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public string? BrandColor { get; set; }
    public string? SupportEmail { get; set; }
     public string? SmtpHost { get; set; }
    public int? SmtpPort { get; set; }
    public string? SmtpFromEmail { get; set; }
    public string? SmtpFromName { get; set; }
    public string? SmtpUsername { get; set; }
    public string? SmtpPassword { get; set; }
    public string? ImapHost { get; set; }
    public int? ImapPort { get; set; }
    public bool EmailPollingEnabled { get; set; }
    public DateTime TrialEndsAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? WhatsAppNumber { get; set; }
    public string? TwilioAccountSid { get; set; }
    public string? TwilioAuthToken { get; set; }
    public string? SlackWebhookUrl { get; set; }
    public string? TeamsWebhookUrl { get; set; }
  public ICollection<User> Users { get; set; } = new List<User>();
}
