using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Services;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using iM3Helpdesk.Application.Contracts.Services;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/admin/leads")]
[Authorize(Roles = nameof(UserRole.SuperAdmin))]
public class AdminLeadsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IConfiguration _configuration;
  private readonly IEmailService _emailService;
  private readonly ILogger<AdminLeadsController> _logger;

  public AdminLeadsController(
    ApplicationDbContext context,
    IConfiguration configuration,
    IEmailService emailService,
    ILogger<AdminLeadsController> logger)
  {
    _context = context;
    _configuration = configuration;
    _emailService = emailService;
    _logger = logger;
  }

  [HttpGet]
  public async Task<IActionResult> GetLeads([FromQuery] string? status = null)
  {
    var query = _context.Leads.AsQueryable();

    if (TryParseLeadStatus(status, out var parsed) && parsed.HasValue)
    {
      query = query.Where(x => x.Status == parsed.Value);
    }

    var leads = await query
      .OrderByDescending(x => x.CreatedAt)
      .Select(x => new
      {
        x.Id,
        x.OrganizationName,
        x.OwnerName,
        x.WorkEmail,
        x.Phone,
        x.Notes,
        x.Status,
        x.RegistrationToken,
        x.TokenExpiry,
        x.TokenUsedAt,
        x.CreatedAt,
        x.ApprovedAt,
        x.RejectedAt,
        x.UpdatedAt
      })
      .ToListAsync();

    return Ok(leads);
  }

  [HttpGet("summary")]
  public async Task<IActionResult> GetLeadSummary()
  {
    var grouped = await _context.Leads
      .GroupBy(x => x.Status)
      .Select(g => new { status = g.Key, count = g.Count() })
      .ToListAsync();

    int Get(LeadStatus s) => grouped.FirstOrDefault(x => x.status == s)?.count ?? 0;

    var pending = Get(LeadStatus.Pending);
    var approved = Get(LeadStatus.Approved);
    var rejected = Get(LeadStatus.Rejected);
    var completed = Get(LeadStatus.Completed);

    return Ok(new
    {
      pending,
      approved,
      rejected,
      completed,
      total = pending + approved + rejected + completed
    });
  }

  [HttpPost("{id:guid}/approve")]
  public async Task<IActionResult> Approve(Guid id)
  {
    var lead = await _context.Leads.FirstOrDefaultAsync(x => x.Id == id);
    if (lead == null)
      return NotFound(new { message = "Lead not found." });

    if (lead.Status != LeadStatus.Pending)
      return BadRequest(new { message = "Lead is not pending." });

    var token = Guid.NewGuid();
    lead.Status = LeadStatus.Approved;
    lead.RegistrationToken = token;
    lead.TokenExpiry = DateTime.UtcNow.AddHours(24);
    lead.ApprovedAt = DateTime.UtcNow;
    lead.ApprovedByUserId = GetCurrentUserId();
    lead.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    var frontendBaseUrl = NormalizeFrontendBaseUrl(
      _configuration["AppSettings:BaseUrl"]
      ?? _configuration["Frontend:BaseUrl"]
      ?? "http://localhost:4200");
    var setupUrl = $"{frontendBaseUrl}/setup-org?token={token}";

    var emailSent = false;
    string? emailError = null;
    try
    {
      var expiry = lead.TokenExpiry?.ToString("yyyy-MM-dd HH:mm 'UTC'") ?? "";
      var subject = $"✅ Organization onboarding approved — {lead.OrganizationName}";
      var body = $@"
<h2 style='margin:0 0 8px'>Your request is approved</h2>
<p style='margin:0 0 16px'>Hi <strong>{lead.OwnerName}</strong>, your organization <strong>{lead.OrganizationName}</strong> has been approved. Use the button below to complete onboarding.</p>
<div style='text-align:center;margin:24px 0'>
  <a href='{setupUrl}' style='background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block'>Complete Setup</a>
</div>
<div style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:12px;color:#6b7280'>
  <div style='margin-bottom:6px'><strong>Link not working?</strong> Copy and paste:</div>
  <div style='word-break:break-all;color:#2563eb'>{setupUrl}</div>
  {(string.IsNullOrWhiteSpace(expiry) ? "" : $"<div style='margin-top:10px'>This link expires: <strong>{expiry}</strong></div>")}
</div>";

      await _emailService.SendAsync(lead.WorkEmail, subject, body);
      emailSent = true;
    }
    catch (Exception ex)
    {
      _logger.LogWarning(ex, "Failed to send onboarding email for lead {LeadId}", lead.Id);
      emailSent = false;
      // Prefer a short, user-facing message while still being specific.
      var messages = new List<string>();
      for (var e = ex; e != null; e = e.InnerException)
      {
        var m = (e.Message ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(m) && !messages.Contains(m))
          messages.Add(m);
      }
      emailError = messages.Count > 0 ? string.Join(" | ", messages) : "Unknown email error";
    }

    return Ok(new
    {
      message = "Lead approved successfully.",
      setupUrl,
      token,
      tokenExpiry = lead.TokenExpiry,
      emailSent,
      emailError
    });
  }

  public record RejectLeadRequest(string? reason);

  [HttpPost("{id:guid}/reject")]
  public async Task<IActionResult> Reject(Guid id, [FromBody] RejectLeadRequest? dto)
  {
    var lead = await _context.Leads.FirstOrDefaultAsync(x => x.Id == id);
    if (lead == null)
      return NotFound(new { message = "Lead not found." });

    if (lead.Status != LeadStatus.Pending)
      return BadRequest(new { message = "Lead is not pending." });

    lead.Status = LeadStatus.Rejected;
    lead.RejectedAt = DateTime.UtcNow;
    lead.RejectionReason = string.IsNullOrWhiteSpace(dto?.reason) ? null : dto!.reason.Trim();
    lead.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();

    return Ok(new { message = "Lead rejected successfully." });
  }

  private Guid? GetCurrentUserId()
  {
    var subject = User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub");

    return Guid.TryParse(subject, out var userId) ? userId : null;
  }

  private static string NormalizeFrontendBaseUrl(string raw)
  {
    var v = (raw ?? "").Trim();
    if (string.IsNullOrWhiteSpace(v))
      return "http://localhost:4200";

    v = v.TrimEnd('/');

    // If scheme is missing (e.g. "localhost:4200"), default to http.
    if (!Uri.TryCreate(v, UriKind.Absolute, out var uri))
      v = $"http://{v}";

    return v.TrimEnd('/');
  }

  private static bool TryParseLeadStatus(string? raw, out LeadStatus? status)
  {
    status = null;
    var v = (raw ?? "").Trim();
    if (string.IsNullOrWhiteSpace(v) || v.Equals("all", StringComparison.OrdinalIgnoreCase))
      return true;

    if (int.TryParse(v, out var i) && Enum.IsDefined(typeof(LeadStatus), i))
    {
      status = (LeadStatus)i;
      return true;
    }

    if (Enum.TryParse<LeadStatus>(v, ignoreCase: true, out var parsed))
    {
      status = parsed;
      return true;
    }

    return false;
  }
}