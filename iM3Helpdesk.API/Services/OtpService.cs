using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace iM3Helpdesk.API.Services;

// ─────────────────────────────────────────
//  Interface
// ─────────────────────────────────────────
public interface IOtpService
{
  /// <summary>
  /// 6-digit OTP generate karke email pe bhejo.
  /// Returns false if user not found.
  /// </summary>
  Task<bool> SendOtpAsync(string email);

  /// <summary>
  /// OTP verify karo — true = valid, false = invalid/expired
  /// </summary>
  Task<bool> VerifyOtpAsync(string email, string otp);
}

// ─────────────────────────────────────────
//  Implementation
// ─────────────────────────────────────────
public class OtpService : IOtpService
{
  private readonly IMemoryCache _cache;
  private readonly IServiceScopeFactory _scopeFactory;
  private readonly ILogger<OtpService> _logger;

  // OTP 5 minute tak valid rahega
  private static readonly TimeSpan OtpExpiry =
      TimeSpan.FromMinutes(5);

  // Cache key prefix — email se conflict na ho
  private static string CacheKey(string email) =>
      $"otp:{email.ToLower().Trim()}";

  public OtpService(
      IMemoryCache cache,
      IServiceScopeFactory scopeFactory,
      ILogger<OtpService> logger)
  {
    _cache = cache;
    _scopeFactory = scopeFactory;
    _logger = logger;
  }

  public async Task<bool> SendOtpAsync(string email)
  {
    using var scope = _scopeFactory.CreateScope();
    var context = scope.ServiceProvider
        .GetRequiredService<ApplicationDbContext>();
    var emailService = scope.ServiceProvider
        .GetRequiredService<
            iM3Helpdesk.Infrastructure.Services.IEmailService>();

    // User exist karta hai?
    var user = await context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Email.ToLower() == email.ToLower());

    if (user == null)
    {
      _logger.LogWarning(
          "OTP requested for unknown email: {E}", email);
      // Security: always return true (don't leak user existence)
      return true;
    }

    // 6-digit random OTP
    var otp = Random.Shared
        .Next(100_000, 999_999)
        .ToString();

    // Store in memory cache with expiry
    var entry = new OtpCacheEntry
    {
      Otp = otp,
      Email = email.ToLower().Trim(),
      Attempts = 0,
      ExpiresAt = DateTime.UtcNow.Add(OtpExpiry)
    };
    _cache.Set(CacheKey(email), entry, OtpExpiry);

    _logger.LogInformation(
        "OTP generated for {E} (expires in 5 min)", email);

    // OTP email bhejo
    try
    {
      await emailService.SendOtpEmailAsync(
          user.Email,
          user.FullName,
          otp);
    }
    catch (Exception ex)
    {
      _logger.LogError(ex, "Failed to send OTP email to {E}", email);
    }

    return true;
  }

  public Task<bool> VerifyOtpAsync(string email, string otp)
  {
    var key = CacheKey(email);

    if (!_cache.TryGetValue(key, out OtpCacheEntry? entry) ||
        entry == null)
    {
      _logger.LogWarning(
          "OTP verify failed — no entry for {E}", email);
      return Task.FromResult(false);
    }

    // Expired check (belt + suspenders — cache TTL handles it too)
    if (entry.ExpiresAt < DateTime.UtcNow)
    {
      _cache.Remove(key);
      return Task.FromResult(false);
    }

    // Max 5 attempts anti-brute-force
    entry.Attempts++;
    if (entry.Attempts > 5)
    {
      _cache.Remove(key);
      _logger.LogWarning(
          "OTP brute-force detected for {E}", email);
      return Task.FromResult(false);
    }

    if (entry.Otp != otp.Trim())
      return Task.FromResult(false);

    // ✅ Valid — remove so it can't be reused
    _cache.Remove(key);
    _logger.LogInformation("OTP verified for {E}", email);
    return Task.FromResult(true);
  }
}

// In-memory OTP entry model
public class OtpCacheEntry
{
  public string Otp { get; set; } = "";
  public string Email { get; set; } = "";
  public int Attempts { get; set; }
  public DateTime ExpiresAt { get; set; }
}
