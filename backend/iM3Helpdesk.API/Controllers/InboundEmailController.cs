using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InboundEmailController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ILogger<InboundEmailController> _logger;
  private readonly IMemoryCache _cache;
  private readonly string _hmacSecret;
  private const int RateLimitCount = 10;
  private static readonly TimeSpan RateLimitWindow = TimeSpan.FromMinutes(1);

  public InboundEmailController(
      ApplicationDbContext context,
      ILogger<InboundEmailController> logger,
      IMemoryCache cache,
      IConfiguration configuration)
  {
    _context = context;
    _logger = logger;
    _cache = cache;
    _hmacSecret = configuration["WebhookSecurity:InboundEmail:Secret"] ?? string.Empty;
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
    var cacheKey = $"inboundemail:ratelimit:{key}";
    if (!_cache.TryGetValue(cacheKey, out int count))
      count = 0;
    count++;
    _cache.Set(cacheKey, count, RateLimitWindow);
    return count > RateLimitCount;
  }

  // Main endpoint — called by email service (SendGrid, Mailgun, etc.)
  [HttpPost]
  public async Task<IActionResult> ReceiveEmail(
      [FromForm] InboundEmailFormDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });

    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });

    return await ProcessEmail(
        dto.From, dto.To, dto.Subject,
        dto.Text, dto.Html, dto.Attachments);
  }

  // JSON version for testing
  [HttpPost("json")]
  public async Task<IActionResult> ReceiveEmailJson(
      [FromBody] InboundEmailJsonDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });
    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });
    return await ProcessEmail(
        dto.From, dto.To, dto.Subject,
        dto.Body, dto.Body, null);
  }

  // Test endpoint — create ticket from support email manually
  [HttpPost("simulate")]
  public async Task<IActionResult> SimulateEmail(
      [FromBody] SimulateEmailDto dto)
  {
    if (!IsValidHmac(Request))
      return Unauthorized(new { message = "Invalid signature" });
    var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    if (IsRateLimited(ip))
      return StatusCode(429, new { message = "Rate limit exceeded" });
    _logger.LogInformation(
        "Simulating email from {From} to {To}",
        dto.FromEmail, dto.ToEmail);

    return await ProcessEmail(
        $"{dto.FromName} <{dto.FromEmail}>",
        dto.ToEmail,
        dto.Subject,
        dto.Body,
        dto.Body,
        null);
  }

  private async Task<IActionResult> ProcessEmail(
      string? from, string? to, string? subject,
      string? textBody, string? htmlBody,
      IFormFileCollection? attachments)
  {
    if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
      return BadRequest(new { message = "From/To required" });

    _logger.LogInformation(
        "Processing inbound email from {From} to {To}: {Subject}",
        from, to, subject);

    // Parse from email
    var fromEmail = ParseEmail(from);
    var fromName = ParseName(from);

    // Find organization by support email
    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            !string.IsNullOrEmpty(o.SupportEmail) &&
            (o.SupportEmail.ToLower() == to.ToLower()
             || to.ToLower().Contains(
                 o.SupportEmail.ToLower())) &&
            o.IsActive);

    if (org == null)
    {
      _logger.LogWarning(
          "No org found for email: {To}", to);
      return Ok(new
      {
        message = "No matching organization"
      });
    }

    // Find or create customer
    var customer = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == fromEmail.ToLower() &&
            u.OrganizationId == org.Id);

    if (customer == null)
    {
      customer = new User
      {
        FullName = string.IsNullOrEmpty(fromName)
              ? fromEmail.Split('@')[0]
              : fromName,
        Email = fromEmail,
        PhoneNumber = "",
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(
              Guid.NewGuid().ToString()),
        Role = UserRole.Customer,
        OrganizationId = org.Id,
        IsEmailVerified = true
      };
      _context.Users.Add(customer);
      await _context.SaveChangesAsync();

      _logger.LogInformation(
          "Auto-created customer: {Email}", fromEmail);
    }

    // Use HTML body if available, else plain text
    var description = !string.IsNullOrEmpty(htmlBody)
        ? htmlBody
        : textBody?.Replace("\n", "<br>") ?? "";

    // Build tags
    var tags = new List<string> { "email" };
    if (!string.IsNullOrEmpty(fromEmail))
      tags.Add(fromEmail.Split('@')[0].ToLower());

    var ticket = new Ticket
    {
      Title = string.IsNullOrEmpty(subject)
            ? $"Email from {fromName ?? fromEmail}"
            : subject,
      Description = description,
      Category = "General",
      Priority = TicketPriority.Medium,
      Status = TicketStatus.Open,
      TicketType = "Support",
      OrganizationId = org.Id,
      CreatedByUserId = customer.Id,
      Tags = string.Join(",", tags)
    };

    // Calculate SLA
    ticket.SlaDeadline = DateTime.UtcNow.AddHours(24);
    ticket.SlaStatus = "OnTrack";

    _context.Tickets.Add(ticket);
    await _context.SaveChangesAsync();

    _logger.LogInformation(
        "Created ticket {Id} from email", ticket.Id);

    // TODO: Handle attachments if provided
    // if (attachments?.Count > 0) { ... }

    return Ok(new
    {
      message = "Ticket created from email",
      ticketId = ticket.Id,
      ticketTitle = ticket.Title,
      customer = customer.FullName,
      organization = org.Name
    });
  }

  private static string ParseEmail(string from)
  {
    if (string.IsNullOrEmpty(from)) return "";
    var match = System.Text.RegularExpressions
        .Regex.Match(from, @"<(.+?)>");
    if (match.Success && match.Groups.Count > 1)
      return match.Groups[1].Value.Trim();
    return from.Trim();
  }

  private static string ParseName(string from)
  {
    if (string.IsNullOrEmpty(from)) return "";
    var match = System.Text.RegularExpressions
        .Regex.Match(from, @"^(.+?)\s*<");
    if (match.Success && match.Groups.Count > 1)
      return match.Groups[1].Value
          .Trim().Trim('"');
    return "";
  }
}

public class InboundEmailFormDto
{
  public string? From { get; set; }
  public string? To { get; set; }
  public string? Subject { get; set; }
  public string? Text { get; set; }
  public string? Html { get; set; }
  public IFormFileCollection? Attachments { get; set; }
}

public class InboundEmailJsonDto
{
  public string? From { get; set; }
  public string? To { get; set; }
  public string? Subject { get; set; }
  public string? Body { get; set; }
}

public class SimulateEmailDto
{
  public string FromEmail { get; set; } = string.Empty;
  public string FromName { get; set; } = string.Empty;
  public string ToEmail { get; set; } = string.Empty;
  public string Subject { get; set; } = string.Empty;
  public string Body { get; set; } = string.Empty;
}
