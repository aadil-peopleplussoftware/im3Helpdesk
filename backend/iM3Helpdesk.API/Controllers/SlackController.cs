using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SlackController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IHttpClientFactory _httpClientFactory;

  public SlackController(
      ApplicationDbContext context,
      IHttpClientFactory httpClientFactory)
  {
    _context = context;
    _httpClientFactory = httpClientFactory;
  }

  // Slack slash command or event webhook
  [HttpPost("webhook")]
  public IActionResult Webhook([FromForm] SlackWebhookDto dto)
  {
    if (dto.Command == "/helpdesk" || dto.Command == "/ticket")
    {
      return Ok(new
      {
        response_type = "ephemeral",
        text = $"Creating ticket: {dto.Text}"
      });
    }
    return Ok();
  }

  // Send Slack notification
  [HttpPost("notify")]
  [Authorize]
  public async Task<IActionResult> SendNotification(
      [FromBody] SlackNotifyDto dto)
  {
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == Guid.Parse(dto.OrgId));

    if (org == null || string.IsNullOrEmpty(org.SlackWebhookUrl))
      return BadRequest(new
      {
        message = "Slack not configured for this org"
      });

    var client = _httpClientFactory.CreateClient();
    var payload = new
    {
      text = dto.Message,
      attachments = new[]
        {
                new
                {
                    color = "#2563eb",
                    fields = new[]
                    {
                        new { title = "Ticket", value = dto.TicketTitle, @short = true },
                        new { title = "Status", value = dto.Status, @short = true }
                    }
                }
            }
    };

    var json = JsonSerializer.Serialize(payload);
    var content = new StringContent(json,
        System.Text.Encoding.UTF8, "application/json");

    await client.PostAsync(org.SlackWebhookUrl, content);

    return Ok(new { message = "Slack notification sent" });
  }

  // Microsoft Teams webhook
  [HttpPost("teams/notify")]
  [Authorize]
  public async Task<IActionResult> SendTeamsNotification(
      [FromBody] SlackNotifyDto dto)
  {
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == Guid.Parse(dto.OrgId));

    if (org == null || string.IsNullOrEmpty(org.TeamsWebhookUrl))
      return BadRequest(new
      {
        message = "Teams not configured for this org"
      });

    var client = _httpClientFactory.CreateClient();
    var payload = new
    {
      type = "MessageCard",
      context = "http://schema.org/extensions",
      themeColor = "2563eb",
      summary = dto.Message,
      sections = new[]
        {
                new
                {
                    activityTitle = dto.TicketTitle,
                    activitySubtitle = $"Status: {dto.Status}",
                    activityText = dto.Message
                }
            }
    };

    var json = JsonSerializer.Serialize(payload);
    var content = new StringContent(json,
        System.Text.Encoding.UTF8, "application/json");

    await client.PostAsync(org.TeamsWebhookUrl, content);

    return Ok(new { message = "Teams notification sent" });
  }
}

public class SlackWebhookDto
{
  public string? Command { get; set; }
  public string? Text { get; set; }
  public string? EventType { get; set; }
  public string? Channel { get; set; }
  public string? UserId { get; set; }
}

public class SlackNotifyDto
{
  public string OrgId { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
  public string TicketTitle { get; set; } = string.Empty;
  public string Status { get; set; } = string.Empty;
}
