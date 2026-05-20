using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WhatsAppController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly IMemoryCache _cache;
  private readonly string _hmacSecret;
  private const int RateLimitCount = 10;
  private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(1);

  public WhatsAppController(
      ApplicationDbContext context,
      IMemoryCache cache,
      IConfiguration configuration)
  {
    _context = context;
    _cache = cache;
    _hmacSecret = configuration["WebhookSecurity:WhatsApp:Secret"] ?? string.Empty;
  }

  private bool IsValidHmac(HttpRequest request)
  {
    if (string.IsNullOrWhiteSpace(_hmacSecret))
      return false;

    if (!request.Headers.TryGetValue("X-Hub-Signature", out var sigHeader))
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
    var cacheKey = $"whatsapp:ratelimit:{key}";
    if (!_cache.TryGetValue(cacheKey, out int count))
      count = 0;
    count++;
    _cache.Set(cacheKey, count, RateLimitWindow);
    return count > RateLimitCount;
  }


  [HttpPost("webhook")]
  public IActionResult Webhook([FromForm] WhatsAppWebhookDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });

    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });

    if (string.IsNullOrEmpty(dto.Body) || string.IsNullOrEmpty(dto.From))
      return BadRequest();

    return Ok(new { message = "Received" });
  }

  // Send WhatsApp reply
  [HttpPost("send")]
  public IActionResult SendMessage([FromBody] SendWhatsAppDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });

    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });

    return Ok(new
    {
      message = "WhatsApp configured (Twilio credentials needed)"
    });
  }
}

public class WhatsAppWebhookDto
{
  public string? From { get; set; }
  public string? To { get; set; }
  public string? Body { get; set; }
  public string? ProfileName { get; set; }
  public string? MediaUrl0 { get; set; }
}

public class SendWhatsAppDto
{
  public string To { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
}
