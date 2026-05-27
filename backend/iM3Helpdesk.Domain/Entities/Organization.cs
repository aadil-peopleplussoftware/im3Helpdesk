
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
    /// <summary>
    /// UTC timestamp captured when EmailPollingEnabled was first switched on
    /// (or when SMTP/IMAP was first configured). Inbound emails delivered
    /// strictly BEFORE this moment are ignored by the polling service so that
    /// onboarding does not retro-create tickets from historical inbox mail.
    /// </summary>
    public DateTime? EmailPollingOnboardedAt { get; set; }
    /// <summary>
    /// How often this org's mailbox should be polled, in seconds.
    /// Minimum enforced at 5s, default 30s. The polling service uses a
    /// per-org last-polled tracker so each org respects its own cadence.
    /// </summary>
    public int EmailPollingIntervalSeconds { get; set; } = 30;
    /// <summary>
    /// IANA timezone (e.g. "Asia/Kolkata", "America/New_York") used to
    /// render dates and times throughout the app for this org. Falls back
    /// to "Asia/Kolkata" if null.
    /// </summary>
    public string? Timezone { get; set; }
    public DateTime TrialEndsAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? WhatsAppNumber { get; set; }
    public string? TwilioAccountSid { get; set; }
    public string? TwilioAuthToken { get; set; }
    public string? SlackWebhookUrl { get; set; }
    public string? TeamsWebhookUrl { get; set; }

  // ── Recycle Bin retention ────────────────────────────────────────────
  /// <summary>
  /// Numeric portion of the recycle bin retention window. Combined with
  /// <see cref="RecycleBinRetentionUnit"/> to compute the maximum age a
  /// soft-deleted ticket is kept before being permanently purged by the
  /// background purge worker. Default: 30.
  /// </summary>
  public int RecycleBinRetentionValue { get; set; } = 30;
  /// <summary>
  /// Unit for <see cref="RecycleBinRetentionValue"/>. One of "days",
  /// "months", or "years". Default: "days".
  /// </summary>
  public string RecycleBinRetentionUnit { get; set; } = "days";

  public ICollection<User> Users { get; set; } = new List<User>();
}
