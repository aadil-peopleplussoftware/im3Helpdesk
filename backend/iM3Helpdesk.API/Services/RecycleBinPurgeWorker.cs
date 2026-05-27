using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Services;

/// <summary>
/// Daily background worker that permanently deletes tickets in the
/// recycle bin once they exceed each organization's configured
/// retention window (e.g. 30 days, 6 months, 1 year). Restored tickets
/// are skipped (their IsDeleted flag is false).
/// </summary>
public class RecycleBinPurgeWorker : BackgroundService
{
    // Run once on boot, then every 6 hours. This gives a tighter purge
    // window than a strict 24h cycle without thrashing the DB.
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    private readonly IServiceProvider _services;
    private readonly ILogger<RecycleBinPurgeWorker> _logger;

    public RecycleBinPurgeWorker(
        IServiceProvider services,
        ILogger<RecycleBinPurgeWorker> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small initial delay so we don't run while migrations are still
        // applying on first boot.
        try { await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PurgeExpiredAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Recycle bin purge worker error");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task PurgeExpiredAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider
            .GetRequiredService<ApplicationDbContext>();

        var now = DateTime.UtcNow;

        // Pull every org's retention config once.
        var orgs = await db.Organizations
            .AsNoTracking()
            .Select(o => new
            {
                o.Id,
                o.RecycleBinRetentionValue,
                o.RecycleBinRetentionUnit
            })
            .ToListAsync(ct);

        var totalPurged = 0;

        foreach (var org in orgs)
        {
            var value = org.RecycleBinRetentionValue;
            if (value <= 0) continue;

            // Cutoff is "anything deleted before this UTC instant is eligible".
            var unit = (org.RecycleBinRetentionUnit ?? "days")
                .Trim().ToLowerInvariant();

            DateTime cutoff = unit switch
            {
                "year" or "years" => now.AddYears(-value),
                "month" or "months" => now.AddMonths(-value),
                _ => now.AddDays(-value)
            };

            var expired = await db.Tickets
                .IgnoreQueryFilters()
                .Where(t =>
                    t.OrganizationId == org.Id &&
                    t.IsDeleted &&
                    t.DeletedAt != null &&
                    t.DeletedAt <= cutoff)
                .ToListAsync(ct);

            if (expired.Count == 0) continue;

            var ids = expired.Select(t => t.Id).ToList();
            var comments = await db.TicketComments
                .IgnoreQueryFilters()
                .Where(c => ids.Contains(c.TicketId))
                .ToListAsync(ct);

            if (comments.Count > 0)
                db.TicketComments.RemoveRange(comments);
            db.Tickets.RemoveRange(expired);

            await db.SaveChangesAsync(ct);
            totalPurged += expired.Count;
        }

        if (totalPurged > 0)
            _logger.LogInformation(
                "Recycle bin purge complete: {Count} ticket(s) permanently deleted.",
                totalPurged);
    }
}
