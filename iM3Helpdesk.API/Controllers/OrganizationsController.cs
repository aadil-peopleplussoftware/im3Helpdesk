using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
      org.TrialEndsAt,
      org.IsActive
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
    if (dto.SupportEmail != null) org.SupportEmail = dto.SupportEmail;
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

    await _context.SaveChangesAsync();
    return Ok(new { message = "Organization updated" });
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
}

public class UpdateOrgDto
{
  public string? Name { get; set; }
  public string? SupportEmail { get; set; }
  public string? BrandColor { get; set; }
  public string? LogoUrl { get; set; }
  public string? SlackWebhookUrl { get; set; }
  public string? TeamsWebhookUrl { get; set; }
  public string? WhatsAppNumber { get; set; }
  public string? TwilioAccountSid { get; set; }
  public string? TwilioAuthToken { get; set; }
}
