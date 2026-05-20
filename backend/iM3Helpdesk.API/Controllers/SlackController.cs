using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SlackController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IHttpClientFactory _httpClientFactory;
  private readonly IMemoryCache _cache;
  private readonly string _hmacSecret;
  private const int RateLimitCount = 10;
  private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(1);

  public SlackController(
      ApplicationDbContext context,
      IHttpClientFactory httpClientFactory,
      IMemoryCache cache,
      IConfiguration configuration)
  {
    _context = context;
    _httpClientFactory = httpClientFactory;
    _cache = cache;
    _hmacSecret = configuration["WebhookSecurity:Slack:Secret"] ?? string.Empty;
  }

  private bool IsValidHmac(HttpRequest request)
  {
    if (string.IsNullOrWhiteSpace(_hmacSecret))
      return false;

    if (!request.Headers.TryGetValue("X-Slack-Signature", out var sigHeader))
      return false;

    var signature = sigHeader.ToString();
    if (string.IsNullOrWhiteSpace(signature))
      return false;

    request.EnableBuffering();
    request.Body.Seek(0, SeekOrigin.Begin);
    using var reader = new StreamReader(request.Body, Encoding.UTF8, leaveOpen: true);
    var body = reader.ReadToEnd();
    request.Body.Seek(0, SeekOrigin.Begin);

    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_hmacSecret));
    var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
    var expected = "sha256=" + Convert.ToHexString(hash).ToLowerInvariant();
    return CryptographicEquals(signature, expected);
  }

  private static bool CryptographicEquals(string a, string b)
  {
    if (a.Length != b.Length) return false;
    var result = 0;
    for (int i = 0; i < a.Length; i++)
      result |= a[i] ^ b[i];
    return result == 0;
  }

  private bool IsRateLimited(string key)
  {
    var cacheKey = $"slack:ratelimit:{key}";
    if (!_cache.TryGetValue(cacheKey, out int count))
      count = 0;
    count++;
    _cache.Set(cacheKey, count, RateLimitWindow);
    return count > RateLimitCount;
  }

  // Slack slash command or event webhook
  [HttpPost("webhook")]
  public IActionResult Webhook([FromForm] SlackWebhookDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });

    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });

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
