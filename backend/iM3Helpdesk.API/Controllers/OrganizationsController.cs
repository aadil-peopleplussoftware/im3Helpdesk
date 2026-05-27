using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Net.Mail;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrganizationsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly IWebHostEnvironment _env;

  public OrganizationsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      IWebHostEnvironment env)
  {
    _context = context;
    _tenantService = tenantService;
    _env = env;
  }

  [HttpGet("current")]
  public async Task<IActionResult> GetCurrent()
  {
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    if (org == null) return NotFound();

    return Ok(new
    {
      org.Id,
      org.Name,
      org.Slug,
      org.LogoUrl,
      org.BrandColor,
      org.SupportEmail,
      org.SmtpHost,
      org.SmtpPort,
      org.SmtpFromEmail,
      org.SmtpFromName,
      org.SmtpUsername,
      smtpPasswordSet = !string.IsNullOrWhiteSpace(org.SmtpPassword),
      org.ImapHost,
      org.ImapPort,
      org.EmailPollingEnabled,
      org.EmailPollingOnboardedAt,
      org.EmailPollingIntervalSeconds,
      Timezone = org.Timezone ?? "Asia/Kolkata",
      org.TrialEndsAt,
      org.IsActive,
      org.CreatedAt,
      org.WhatsAppNumber,
      org.TwilioAccountSid,
      // Auth token is sensitive \u2014 expose only a "set" flag, not the value.
      twilioAuthTokenSet = !string.IsNullOrWhiteSpace(org.TwilioAuthToken),
      org.SlackWebhookUrl,
      org.TeamsWebhookUrl,
      // Recycle bin retention window. Tickets older than this since
      // their DeletedAt are auto-purged by RecycleBinPurgeWorker.
      org.RecycleBinRetentionValue,
      org.RecycleBinRetentionUnit
    });
  }

  [HttpPut("current")]
  public async Task<IActionResult> UpdateCurrent(
      [FromBody] UpdateOrgDto dto)
  {
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    if (org == null) return NotFound();

    if (dto.Name != null) org.Name = dto.Name;
   if (dto.SupportEmail != null)
      org.SupportEmail = NormalizeEmail(dto.SupportEmail);
    if (dto.BrandColor != null) org.BrandColor = dto.BrandColor;
    if (dto.LogoUrl != null) org.LogoUrl = dto.LogoUrl;
    if (dto.SlackWebhookUrl != null)
      org.SlackWebhookUrl = dto.SlackWebhookUrl;
    if (dto.TeamsWebhookUrl != null)
      org.TeamsWebhookUrl = dto.TeamsWebhookUrl;
    if (dto.WhatsAppNumber != null)
      org.WhatsAppNumber = dto.WhatsAppNumber;
    if (dto.TwilioAccountSid != null)
      org.TwilioAccountSid = dto.TwilioAccountSid;
    if (dto.TwilioAuthToken != null)
      org.TwilioAuthToken = dto.TwilioAuthToken;
    if (dto.RecycleBinRetentionValue.HasValue)
    {
      // Clamp to a sensible range: at least 1, at most ~100 years.
      var raw = dto.RecycleBinRetentionValue.Value;
      org.RecycleBinRetentionValue = raw < 1 ? 1 : (raw > 36500 ? 36500 : raw);
    }
    if (!string.IsNullOrWhiteSpace(dto.RecycleBinRetentionUnit))
    {
      var unit = dto.RecycleBinRetentionUnit.Trim().ToLowerInvariant();
      if (unit == "day" || unit == "days") org.RecycleBinRetentionUnit = "days";
      else if (unit == "month" || unit == "months") org.RecycleBinRetentionUnit = "months";
      else if (unit == "year" || unit == "years") org.RecycleBinRetentionUnit = "years";
    }
    ApplyEmailSettings(org, dto);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Organization updated" });
  }

  [HttpPost("current/complete-onboarding")]
  public async Task<IActionResult> CompleteOnboarding()
  {
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;

    if (!Guid.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == userId);

    if (user == null)
      return NotFound();

    if (!user.LastLoginAt.HasValue)
    {
      user.LastLoginAt = DateTime.UtcNow;
      await _context.SaveChangesAsync();
    }

    return Ok(new { message = "Onboarding completed" });
  }

  [HttpPost("upload-logo")]
  public async Task<IActionResult> UploadLogo(IFormFile file)
  {
    if (file == null || file.Length == 0)
      return BadRequest(new { message = "No file" });

    var uploadPath = Path.Combine(
        _env.WebRootPath ?? "wwwroot", "logos");
    Directory.CreateDirectory(uploadPath);

    var ext = Path.GetExtension(file.FileName);
    var fileName = $"org-{_tenantService.OrganizationId}{ext}";
    var filePath = Path.Combine(uploadPath, fileName);

    using var stream = new FileStream(filePath, FileMode.Create);
    await file.CopyToAsync(stream);

    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    if (org != null)
    {
      org.LogoUrl = $"/logos/{fileName}";
      await _context.SaveChangesAsync();
    }

    return Ok(new
    {
      logoUrl = $"/logos/{fileName}"
    });
  }

  
  private static void ApplyEmailSettings(
      iM3Helpdesk.Domain.Entities.Organization org,
      UpdateOrgDto dto)
  {
    if (dto.SmtpHost != null) org.SmtpHost = Clean(dto.SmtpHost);
    if (dto.SmtpPort.HasValue) org.SmtpPort = dto.SmtpPort;
    if (dto.SmtpFromEmail != null)
      org.SmtpFromEmail = NormalizeEmail(dto.SmtpFromEmail);
    if (dto.SmtpFromName != null)
      org.SmtpFromName = Clean(dto.SmtpFromName);
    if (dto.SmtpUsername != null)
      org.SmtpUsername = NormalizeEmail(dto.SmtpUsername);
    if (!string.IsNullOrWhiteSpace(dto.SmtpPassword))
      org.SmtpPassword = dto.SmtpPassword.Trim();
    if (dto.ImapHost != null) org.ImapHost = Clean(dto.ImapHost);
    if (dto.ImapPort.HasValue) org.ImapPort = dto.ImapPort;
    if (dto.EmailPollingEnabled.HasValue)
    {
      // Stamp onboarding time the first time polling is enabled (or when
      // it's re-enabled after being off). Inbound emails delivered before
      // this moment will be skipped by EmailPollingService.
      if (dto.EmailPollingEnabled.Value && !org.EmailPollingEnabled)
        org.EmailPollingOnboardedAt = DateTime.UtcNow;
      org.EmailPollingEnabled = dto.EmailPollingEnabled.Value;
    }
    if (dto.EmailPollingIntervalSeconds.HasValue)
    {
      var raw = dto.EmailPollingIntervalSeconds.Value;
      org.EmailPollingIntervalSeconds = raw < 5 ? 5 : raw;
    }
    if (dto.Timezone != null)
      org.Timezone = Clean(dto.Timezone);

    // Belt-and-braces: if SMTP/IMAP just got filled in for the first time
    // and onboarding stamp is still null, set it now.
    if (org.EmailPollingOnboardedAt == null &&
        !string.IsNullOrWhiteSpace(org.SmtpHost) &&
        !string.IsNullOrWhiteSpace(org.ImapHost))
      org.EmailPollingOnboardedAt = DateTime.UtcNow;

    if (string.IsNullOrWhiteSpace(org.SmtpFromEmail))
      org.SmtpFromEmail = org.SupportEmail;
    if (string.IsNullOrWhiteSpace(org.SmtpUsername))
      org.SmtpUsername = org.SmtpFromEmail;
  }

  private static string? Clean(string? value)
  {
    var clean = value?.Trim();
    return string.IsNullOrWhiteSpace(clean) ? null : clean;
  }

  private static string? NormalizeEmail(string? value)
  {
    var clean = Clean(value)?.ToLowerInvariant();
    if (clean == null) return null;

    try
    {
      return new MailAddress(clean).Address;
    }
    catch
    {
      return clean;
    }
  }
}

public class UpdateOrgDto
{
  public string? Name { get; set; }
  public string? SupportEmail { get; set; }
  public string? BrandColor { get; set; }
  public string? LogoUrl { get; set; }
  public string? SmtpHost { get; set; }
  public int? SmtpPort { get; set; }
  public string? SmtpFromEmail { get; set; }
  public string? SmtpFromName { get; set; }
  public string? SmtpUsername { get; set; }
  public string? SmtpPassword { get; set; }
  public string? ImapHost { get; set; }
  public int? ImapPort { get; set; }
  public bool? EmailPollingEnabled { get; set; }
  public int? EmailPollingIntervalSeconds { get; set; }
  public string? Timezone { get; set; }
  public string? SlackWebhookUrl { get; set; }
  public string? TeamsWebhookUrl { get; set; }
  public string? WhatsAppNumber { get; set; }
  public string? TwilioAccountSid { get; set; }
  public string? TwilioAuthToken { get; set; }
  public int? RecycleBinRetentionValue { get; set; }
  public string? RecycleBinRetentionUnit { get; set; }
}
