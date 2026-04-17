using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EmailNotificationSettingsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public EmailNotificationSettingsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var settings = await _context.EmailNotificationSettings
            .ToListAsync();

        return Ok(settings.Select(s => new
        {
            s.NotifKey,
            s.IsEnabled
        }));
    }

    [HttpPost]
    public async Task<IActionResult> SaveAll(
        [FromBody] List<NotifSettingDto> settings)
    {
        var existing = await _context.EmailNotificationSettings
            .ToListAsync();

        foreach (var dto in settings)
        {
            var s = existing.FirstOrDefault(
                e => e.NotifKey == dto.NotifKey);

            if (s != null)
            {
                s.IsEnabled = dto.IsEnabled;
            }
            else
            {
                _context.EmailNotificationSettings.Add(
                    new EmailNotificationSetting
                    {
                        NotifKey = dto.NotifKey,
                        IsEnabled = dto.IsEnabled,
                        OrganizationId =
                            _tenantService.OrganizationId!.Value
                    });
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Settings saved" });
    }

    [NonAction]  
    public async Task<bool> IsEnabledAsync(
        string notifKey)
    {
      var setting = await _context
          .EmailNotificationSettings
          .FirstOrDefaultAsync(s =>
              s.NotifKey == notifKey);

      return setting?.IsEnabled ?? true;
    }
}

public class NotifSettingDto
{
    public string NotifKey { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
}
