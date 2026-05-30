using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace iM3Helpdesk.API.Services;

/// <summary>
/// Posts a "Holiday today" announcement to the Knowledge Base each day at
/// the configured IST time. One post per (org, day) — uniqueness is enforced
/// on the post title. Mirrors <see cref="BirthdayPostWorker"/>; uses a
/// dedicated bot user named "{Org} Announcements".
/// </summary>
public class HolidayPostWorker : BackgroundService
{
  private readonly IServiceProvider _sp;
  private readonly ILogger<HolidayPostWorker> _logger;
  private readonly HolidayPostOptions _options;

  public HolidayPostWorker(
      IServiceProvider sp,
      IOptions<HolidayPostOptions> options,
      ILogger<HolidayPostWorker> logger)
  {
    _sp = sp;
    _logger = logger;
    _options = options.Value;
  }

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    _logger.LogInformation(
      "HolidayPostWorker started. Enabled={Enabled}. Scheduled {Hour:D2}:{Minute:D2} IST.",
      _options.Enabled, _options.RunHourIst, _options.RunMinuteIst);

    while (!stoppingToken.IsCancellationRequested)
    {
      try { await RunOnce(stoppingToken); }
      catch (Exception ex) { _logger.LogError(ex, "HolidayPostWorker error"); }

      var delay = GetDelayUntilNextRunIst();
      try { await Task.Delay(delay, stoppingToken); }
      catch (TaskCanceledException) { }
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
    => $"{orgName} Announcements";

  private static string PostTitle(string orgName, DateOnly day)
    => $"🎉 Holiday Today — {orgName} — {day:dd MMM yyyy}";

  private static string PostTags()
    => "holiday,auto,announcement";

  private static string BuildPostContent(string orgName, IReadOnlyList<(string Occasion, bool IsFloating)> holidays, DateOnly day)
  {
    var lines = holidays
      .Select(h => h.IsFloating ? $"- {h.Occasion} (Floating / Optional)" : $"- {h.Occasion}")
      .ToList();
    var listBlock = string.Join("\n", lines);

    var headline = holidays.Count == 1 ? "Holiday Today" : "Holidays Today";

    return $@"{headline} — {day:dddd, dd MMM yyyy}
FROM THE {orgName.ToUpperInvariant()} TEAM

{listBlock}

Wishing everyone a wonderful day off. Offices are closed today on account of the above and regular operations will resume tomorrow.

For any urgent help-desk queries during the holiday, please continue using the portal — tickets will be picked up on the next business day.

— {orgName}";
  }

  private async Task RunOnce(CancellationToken ct)
  {
    if (!_options.Enabled)
    {
      _logger.LogDebug("HolidayPostWorker is disabled by configuration.");
      return;
    }

    using var scope = _sp.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

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
        var todays = await db.Holidays
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(h => h.OrganizationId == org.Id && h.Date == today)
            .OrderBy(h => h.Occasion)
            .Select(h => new { h.Occasion, h.IsFloating })
            .ToListAsync(ct);

        if (todays.Count == 0) continue;

        var title = PostTitle(org.Name, today);
        var already = await db.KbArticles
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(a => a.OrganizationId == org.Id && a.Title == title, ct);
        if (already) continue;

        var article = new KbArticle
        {
          Title = title,
          Content = BuildPostContent(
              org.Name,
              todays.Select(t => (t.Occasion, t.IsFloating)).ToList(),
              today),
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
          "Holiday KB post created for org {OrgId} ({OrgName}). Count={Count} Day={Day}.",
          org.Id, org.Name, todays.Count, today);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Holiday KB post failed for org {OrgId}", org.Id);
      }
    }
  }
}
