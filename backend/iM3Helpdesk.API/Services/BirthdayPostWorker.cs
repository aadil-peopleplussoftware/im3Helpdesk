using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace iM3Helpdesk.API.Services;

public class BirthdayPostWorker : BackgroundService
{
  private readonly IServiceProvider _sp;
  private readonly ILogger<BirthdayPostWorker> _logger;
  private readonly BirthdayPostOptions _options;

  public BirthdayPostWorker(
      IServiceProvider sp,
      IOptions<BirthdayPostOptions> options,
      ILogger<BirthdayPostWorker> logger)
  {
    _sp = sp;
    _logger = logger;
    _options = options.Value;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    _logger.LogInformation(
      "BirthdayPostWorker started. Enabled={Enabled}. Scheduled {Hour:D2}:{Minute:D2} IST.",
      _options.Enabled,
      _options.RunHourIst,
      _options.RunMinuteIst);

    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        await RunOnce(stoppingToken);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "BirthdayPostWorker error");
      }

      var delay = GetDelayUntilNextRunIst();
      try
      {
        await Task.Delay(delay, stoppingToken);
      }
      catch (TaskCanceledException)
      {
        // ignore
      }
    }
  }

  private static TimeZoneInfo? TryGetIst()
  {
    try { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
    catch { return null; }
  }

  private TimeSpan GetDelayUntilNextRunIst()
  {
    var tz = TryGetIst();
    var utcNow = DateTime.UtcNow;
    var localNow = tz != null ? TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz) : utcNow;

    var next = new DateTime(localNow.Year, localNow.Month, localNow.Day,
        _options.RunHourIst, _options.RunMinuteIst, 0, DateTimeKind.Unspecified);
    if (next <= localNow) next = next.AddDays(1);
    return next - localNow;
  }

  private static DateOnly GetTodayIst()
  {
    var tz = TryGetIst();
    if (tz == null) return DateOnly.FromDateTime(DateTime.UtcNow);
    var istNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
    return DateOnly.FromDateTime(istNow);
  }

  private static string BotDisplayName(string orgName)
    => $"{orgName} Celebrations";

  private static string PostTitle(string orgName, DateOnly day)
    => $"🎂 Birthday Wishes — {orgName} — {day:dd MMM}";

  private static string PostTags()
    => "birthday,auto,celebrations";

  private static string BuildPostContent(string orgName, IReadOnlyList<string> names, DateOnly day)
  {
    var safeNames = names
      .Where(n => !string.IsNullOrWhiteSpace(n))
      .Select(n => n.Trim())
      .Distinct(StringComparer.OrdinalIgnoreCase)
      .ToList();

    var count = safeNames.Count;
    var peopleLabel = count == 1 ? "team member" : "team members";

    var shown = safeNames.Take(20).ToList();
    var remaining = safeNames.Count - shown.Count;

    var listHeading = count == 1
      ? $"Celebrating today ({day:dd MMM}):"
      : $"Celebrating today ({day:dd MMM}) ({count} {peopleLabel}):";

    var namesBlock = shown.Count == 0
      ? ""
      : listHeading + "\n" + string.Join("\n", shown.Select(n => $"- {n}"));

    if (remaining > 0)
      namesBlock += $"\n- …and {remaining} more";

    return $@"Happy Birthday!
FROM THE {orgName.ToUpperInvariant()} TEAM

{namesBlock}

On behalf of the entire {orgName} team, we wish you a wonderful birthday filled with joy, success, and everything you deserve.

Your dedication and hard work make a real difference every single day. We’re truly grateful to have you as part of our team.

Here’s to another great year ahead — may it bring you new opportunities, growth, and happiness in everything you do.

— {orgName}";
  }

  private static DateOnly NormalizeBirthdayDate(DateOnly dob, int year)
  {
    var month = dob.Month;
    var day = dob.Day;
    var dim = DateTime.DaysInMonth(year, month);
    if (day > dim) day = dim;
    return new DateOnly(year, month, day);
  }

  private async Task RunOnce(CancellationToken ct)
  {
    if (!_options.Enabled)
    {
      _logger.LogDebug("BirthdayPostWorker is disabled by configuration.");
      return;
    }

    using var scope = _sp.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    var tenant = scope.ServiceProvider.GetRequiredService<ICurrentTenantService>();

    // Worker runs outside HTTP scope; tenant may be null.
    // So we always ignore query filters here.
    var orgs = await db.Organizations
        .IgnoreQueryFilters()
        .AsNoTracking()
        .Select(o => new { o.Id, o.Name })
        .ToListAsync(ct);

    var today = GetTodayIst();

    foreach (var org in orgs)
    {
      if (ct.IsCancellationRequested) return;

      try
      {
        // Find birthdays today (internal users only)
        var users = await db.Users
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(u => u.OrganizationId == org.Id)
            .Where(u => u.DateOfBirth != null)
            .Where(u => u.Role == UserRole.Agent || u.Role == UserRole.CompanyAdmin)
            .Select(u => new { u.DateOfBirth, u.FullName })
            .ToListAsync(ct);

        var birthdayNames = users
          .Where(u =>
          {
            if (!u.DateOfBirth.HasValue) return false;
            var occ = NormalizeBirthdayDate(u.DateOfBirth.Value, today.Year);
            return occ == today;
          })
          .Select(u => (u.FullName ?? string.Empty).Trim())
          .Where(n => !string.IsNullOrWhiteSpace(n))
          .Distinct(StringComparer.OrdinalIgnoreCase)
          .OrderBy(n => n)
          .ToList();

        if (birthdayNames.Count <= 0) continue;

        // Avoid duplicate auto posts for the day
        var title = PostTitle(org.Name, today);
        var already = await db.KbArticles
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(a =>
                a.OrganizationId == org.Id &&
                a.Title == title,
                ct);

        if (already) continue;

        var article = new KbArticle
        {
          Title = title,
          Content = BuildPostContent(org.Name, birthdayNames, today),
          Category = "Announcement",
          Tags = PostTags(),
          IsPublished = true,
          MediaUrl = "",
          MediaType = "none",
          OrganizationId = org.Id,
          CreatedByUserId = null,
          AuthorType = "System",
          SystemAuthorLabel = BotDisplayName(org.Name),
          CreatedAt = DateTime.UtcNow
        };

        db.KbArticles.Add(article);
        await db.SaveChangesAsync(ct);

        _logger.LogInformation(
          "Birthday KB post created for org {OrgId} ({OrgName}). Count={Count} Day={Day}.",
          org.Id,
          org.Name,
          birthdayNames.Count,
          today);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Birthday KB post failed for org {OrgId}", org.Id);
      }
    }
  }
}
