using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AIFeaturesController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;
  private readonly ILogger<AIFeaturesController>
      _logger;

  public AIFeaturesController(
      ApplicationDbContext context,
      ICurrentTenantService tenant,
      ILogger<AIFeaturesController> logger)
  {
    _context = context;
    _tenant = tenant;
    _logger = logger;
  }

  private Guid GetUserId()
  {
    var c = User.FindFirst(
        ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(c, out var id);
    return id;
  }

  // ════════════════════════════════════
  // 1. TIDE FORECAST
  // Predict ticket volume by hour/day
  // ════════════════════════════════════
  [HttpGet("tide-forecast")]
  public async Task<IActionResult>
      GetTideForecast(
          [FromQuery] int days = 7)
  {
    var orgId = _tenant.OrganizationId!.Value;
    var cutoff =
        DateTime.UtcNow.AddDays(-90);

    // Get historical tickets
    var tickets = await _context.Tickets
        .AsNoTracking()
        .Where(t =>
            t.OrganizationId == orgId &&
            t.CreatedAt >= cutoff)
        .Select(t => new
        {
          t.CreatedAt,
          DayOfWeek = (int)t.CreatedAt
                .DayOfWeek,
          Hour = t.CreatedAt.Hour
        })
        .ToListAsync();

    // Build hourly pattern
    // Average tickets per hour per weekday
    var hourlyByDay =
        tickets
            .GroupBy(t => new
            {
              t.DayOfWeek,
              t.Hour
            })
            .Select(g => new
            {
              g.Key.DayOfWeek,
              g.Key.Hour,
              AvgCount = g.Count() / 13.0
              // 90 days / 7 ~ 13 weeks
            })
            .ToList();

    // Generate forecast for next N days
    var forecast = new List<object>();
    var now = DateTime.UtcNow.Date;

    for (int d = 0; d < days; d++)
    {
      var date = now.AddDays(d + 1);
      var dow = (int)date.DayOfWeek;

      var hourly = Enumerable
          .Range(0, 24)
          .Select(h =>
          {
            var hist = hourlyByDay
                      .FirstOrDefault(x =>
                          x.DayOfWeek == dow &&
                          x.Hour == h);
            var avg =
                      hist?.AvgCount ?? 0;

            // Add slight randomness
            var jitter =
                      avg > 0
                      ? avg * (0.85 +
                          new Random(
                              d * 24 + h)
                          .NextDouble() * 0.3)
                      : 0;

            return new
            {
              Hour = h,
              Predicted =
                          Math.Round(jitter, 1),
              Label = h == 0
                          ? "12am"
                          : h < 12
                              ? $"{h}am"
                              : h == 12
                                  ? "12pm"
                                  : $"{h - 12}pm"
            };
          })
          .ToList();

      var totalPredicted =
          hourly.Sum(h => h.Predicted);

      // Determine tide level
      var level =
          totalPredicted > 20 ? "High"
          : totalPredicted > 10 ? "Medium"
          : "Low";

      forecast.Add(new
      {
        Date = date.ToString("yyyy-MM-dd"),
        DayName =
              date.ToString("dddd"),
        ShortDay =
              date.ToString("ddd dd MMM"),
        TotalPredicted =
              Math.Round(totalPredicted, 0),
        TideLevel = level,
        Hourly = hourly,
        PeakHour = hourly
              .OrderByDescending(h =>
                  h.Predicted)
              .First().Hour,
        PeakLabel = hourly
              .OrderByDescending(h =>
                  h.Predicted)
              .First().Label
      });
    }

    // Historical summary
    var last7 = tickets
        .Where(t =>
            t.CreatedAt >=
                DateTime.UtcNow.AddDays(-7))
        .GroupBy(t =>
            t.CreatedAt.Date)
        .Select(g => new
        {
          Date = g.Key
                .ToString("ddd dd"),
          Count = g.Count()
        })
        .OrderBy(x => x.Date)
        .ToList();

    return Ok(new
    {
      forecast,
      historical = last7,
      avgDailyActual =
            tickets.Any()
            ? Math.Round(tickets.Count /
                90.0, 1) : 0,
      totalLast90Days = tickets.Count
    });
  }

  // ════════════════════════════════════
  // 2. AI ANALYTICS INSIGHTS
  // Natural language insights
  // ════════════════════════════════════
  [HttpGet("insights")]
  public async Task<IActionResult>
      GetInsights()
  {
    var orgId = _tenant.OrganizationId!.Value;
    var now = DateTime.UtcNow;
    var last30 = now.AddDays(-30);
    var prev30 = now.AddDays(-60);

    var tickets = await _context.Tickets
        .AsNoTracking()
        .Include(t => t.AssignedTo)
        .Where(t =>
            t.OrganizationId == orgId &&
            t.CreatedAt >= prev30)
        .Select(t => new
        {
          t.Id,
          t.Status,
          t.Priority,
          t.Category,
          t.CreatedAt,
          t.ResolvedAt,
          t.SlaStatus,
          t.IsSlaBreached,
          t.Tags,
          Agent = t.AssignedTo != null
                ? t.AssignedTo.FullName : null,
          AssignedToId = t.AssignedToUserId
        })
        .ToListAsync();

    var current = tickets
        .Where(t => t.CreatedAt >= last30)
        .ToList();
    var previous = tickets
        .Where(t =>
            t.CreatedAt >= prev30 &&
            t.CreatedAt < last30)
        .ToList();

    // Resolution time
    var resolved = current
        .Where(t =>
            t.ResolvedAt.HasValue)
        .ToList();

    var avgResHours = resolved.Any()
        ? resolved.Average(t =>
            (t.ResolvedAt!.Value -
             t.CreatedAt).TotalHours)
        : 0;

    // SLA breach rate
    var breachRate = current.Any()
        ? current.Count(t =>
            t.IsSlaBreached) /
          (double)current.Count * 100
        : 0;

    // Volume change
    var volChange = previous.Count > 0
        ? (current.Count -
           previous.Count) /
          (double)previous.Count * 100
        : 0;

    // Top category
    var topCat = current
        .GroupBy(t => t.Category)
        .OrderByDescending(g => g.Count())
        .FirstOrDefault();

    // Busiest day
    var busiestDay = current
        .GroupBy(t =>
            t.CreatedAt.DayOfWeek)
        .OrderByDescending(g => g.Count())
        .FirstOrDefault();

    // Agent performance
    var agentStats = current
        .Where(t => t.Agent != null)
        .GroupBy(t => t.Agent)
        .Select(g => new
        {
          Agent = g.Key,
          Total = g.Count(),
          Resolved = g.Count(t =>
                  t.Status ==
                      TicketStatus.Resolved ||
                  t.Status ==
                      TicketStatus.Closed),
          ResRate = g.Count() > 0
                ? Math.Round(
                    g.Count(t =>
                        t.Status ==
                        TicketStatus.Resolved ||
                        t.Status ==
                        TicketStatus.Closed) /
                    (double)g.Count() * 100, 1)
                : 0
        })
        .OrderByDescending(a => a.ResRate)
        .ToList();

    // Unassigned count
    var unassigned = current
        .Count(t =>
            t.AssignedToId == null);

    // Generate insights
    var insights = new List<object>();

    // Volume trend
    insights.Add(new
    {
      type = volChange > 10
            ? "warning" : volChange < -10
            ? "positive" : "neutral",
      icon = volChange > 0 ? "📈" : "📉",
      title = "Ticket Volume",
      text = volChange > 0
            ? $"Ticket volume is up {Math.Abs(volChange):F0}% " +
              $"vs last month. " +
              $"Consider adding more support staff."
            : volChange < 0
            ? $"Ticket volume dropped " +
              $"{Math.Abs(volChange):F0}% " +
              $"vs last month. " +
              $"Team performance is improving!"
            : "Ticket volume is stable " +
              "compared to last month.",
      metric = $"{(volChange > 0 ? "+" : "")}" +
                 $"{volChange:F0}%",
      value = current.Count
    });

    // Resolution time
    insights.Add(new
    {
      type = avgResHours > 48
            ? "warning"
            : avgResHours < 24
            ? "positive" : "neutral",
      icon = "⏱",
      title = "Resolution Time",
      text = avgResHours > 48
            ? $"Average resolution is " +
              $"{avgResHours:F0}h — above " +
              $"48h target. Review backlog."
            : $"Average resolution is " +
              $"{avgResHours:F1}h — " +
              (avgResHours < 24
                ? "excellent performance!"
                : "within acceptable range."),
      metric =
            $"{avgResHours:F1}h avg",
      value = resolved.Count
    });

    // SLA
    insights.Add(new
    {
      type = breachRate > 20
            ? "critical"
            : breachRate > 10
            ? "warning" : "positive",
      icon = "🎯",
      title = "SLA Compliance",
      text = breachRate > 20
            ? $"{breachRate:F0}% of tickets " +
              $"breached SLA. Urgent attention needed!"
            : breachRate > 10
            ? $"{breachRate:F0}% SLA breach " +
              $"rate. Monitor closely."
            : $"Only {breachRate:F0}% SLA " +
              $"breaches this month. Great job!",
      metric =
            $"{100 - breachRate:F0}% compliant",
      value = current
            .Count(t => t.IsSlaBreached)
    });

    // Top category
    if (topCat != null)
      insights.Add(new
      {
        type = "info",
        icon = "📂",
        title = "Top Category",
        text = $"'{topCat.Key}' is your " +
                 $"most common category " +
                 $"with {topCat.Count()} " +
                 $"tickets. " +
                 $"Consider creating FAQ " +
                 $"or automation for it.",
        metric = $"{topCat.Count()} tickets",
        value = topCat.Count()
      });

    // Unassigned
    if (unassigned > 0)
      insights.Add(new
      {
        type = unassigned > 5
              ? "warning" : "neutral",
        icon = "👤",
        title = "Unassigned Tickets",
        text = $"{unassigned} tickets are " +
                 $"unassigned. " +
                 (unassigned > 5
                     ? "Assign them immediately to avoid SLA breaches."
                     : "Review and assign soon."),
        metric = $"{unassigned} pending",
        value = unassigned
      });

    // Top agent
    if (agentStats.Any())
    {
      var top = agentStats.First();
      insights.Add(new
      {
        type = "positive",
        icon = "🏆",
        title = "Top Performer",
        text = $"{top.Agent} has the best " +
                 $"resolution rate at " +
                 $"{top.ResRate}% " +
                 $"({top.Resolved}/{top.Total} tickets). " +
                 $"Star of the month!",
        metric =
              $"{top.ResRate}% resolved",
        value = top.Total
      });
    }

    // Busiest day
    if (busiestDay != null)
      insights.Add(new
      {
        type = "info",
        icon = "📅",
        title = "Busiest Day",
        text = $"{busiestDay.Key} gets the " +
                 $"most tickets " +
                 $"({busiestDay.Count()} avg). " +
                 $"Ensure full staffing on this day.",
        metric =
              $"{busiestDay.Key}",
        value = busiestDay.Count()
      });

    return Ok(new
    {
      insights,
      summary = new
      {
        totalTickets = current.Count,
        resolved = resolved.Count,
        avgResHours =
                Math.Round(avgResHours, 1),
        slaCompliance =
                Math.Round(
                    100 - breachRate, 1),
        unassigned,
        topCategory = topCat?.Key,
        topAgent =
                agentStats.FirstOrDefault()
                    ?.Agent,
        agentStats
      }
    });
  }

  // ════════════════════════════════════
  // 3. DETECT DUPLICATE TICKETS
  // ════════════════════════════════════
  [HttpGet("duplicates")]
  public async Task<IActionResult>
      DetectDuplicates()
  {
    var orgId = _tenant.OrganizationId!.Value;
    var cutoff =
        DateTime.UtcNow.AddDays(-30);

    var tickets = await _context.Tickets
        .AsNoTracking()
        .Where(t =>
            t.OrganizationId == orgId &&
            t.Status != TicketStatus.Closed &&
            t.CreatedAt >= cutoff)
        .Select(t => new
        {
          t.Id,
          t.Title,
          t.Description,
          t.Category,
          t.Status,
          t.CreatedAt,
          t.TicketNumber,
          t.CreatedByUserId
        })
        .ToListAsync();

    var duplicateGroups =
        new List<object>();

    // Simple similarity: same customer +
    // similar title (word overlap > 60%)
    var processed =
        new HashSet<Guid>();

    for (int i = 0; i < tickets.Count; i++)
    {
      if (processed.Contains(tickets[i].Id))
        continue;

      var group = new List<object>();
      var t1 = tickets[i];
      var t1Words = GetWords(t1.Title);

      for (int j = i + 1;
           j < tickets.Count; j++)
      {
        var t2 = tickets[j];
        if (processed.Contains(t2.Id))
          continue;

        var t2Words =
            GetWords(t2.Title);

        // Check similarity
        var sim =
            GetSimilarity(
                t1Words, t2Words);
        var sameUser =
            t1.CreatedByUserId ==
            t2.CreatedByUserId;
        var sameCategory =
            t1.Category == t2.Category;

        // Score: title sim +
        // same user + same category
        var score = sim
            + (sameUser ? 0.2 : 0)
            + (sameCategory ? 0.1 : 0);

        if (score >= 0.6)
        {
          if (!group.Any())
            group.Add(new
            {
              id = t1.Id,
              ticketNumber =
                    t1.TicketNumber,
              title = t1.Title,
              status =
                    t1.Status
                        .ToString(),
              createdAt =
                    t1.CreatedAt,
              isOriginal = true,
              similarity = 100
            });

          group.Add(new
          {
            id = t2.Id,
            ticketNumber =
                  t2.TicketNumber,
            title = t2.Title,
            status =
                  t2.Status.ToString(),
            createdAt = t2.CreatedAt,
            isOriginal = false,
            similarity =
                  (int)(score * 100)
          });

          processed.Add(t2.Id);
        }
      }

      if (group.Any())
      {
        processed.Add(t1.Id);
        duplicateGroups.Add(new
        {
          groupId = Guid.NewGuid(),
          count = group.Count,
          tickets = group,
          confidence =
                group.Count > 0
                ? "High" : "Medium"
        });
      }
    }

    return Ok(new
    {
      groups = duplicateGroups,
      totalDuplicates =
            duplicateGroups.Count,
      potentialSavings =
            duplicateGroups.Sum(g =>
                ((dynamic)g).count - 1)
    });
  }

  // ════════════════════════════════════
  // MERGE DUPLICATE TICKETS
  // ════════════════════════════════════
  [HttpPost("merge")]
  public async Task<IActionResult>
      MergeTickets(
          [FromBody] MergeTicketsDto dto)
  {
    if (!dto.TicketIdsToClose.Any())
      return BadRequest(
          "No tickets to merge");

    var orgId = _tenant.OrganizationId!.Value;
    var userId = GetUserId();

    // Verify original exists
    var original = await _context.Tickets
        .FirstOrDefaultAsync(t =>
            t.Id == dto.OriginalTicketId &&
            t.OrganizationId == orgId);

    if (original == null)
      return NotFound(
          "Original ticket not found");

    var merged = 0;

    foreach (var tId in
        dto.TicketIdsToClose)
    {
      var dup = await _context.Tickets
          .FirstOrDefaultAsync(t =>
              t.Id == tId &&
              t.OrganizationId == orgId &&
              t.Id != dto.OriginalTicketId);

      if (dup == null) continue;

      // Close duplicate
      dup.Status = TicketStatus.Closed;
      dup.ResolvedAt = DateTime.UtcNow;
      dup.UpdatedAt = DateTime.UtcNow;

      // Add merge note
      _context.TicketComments.Add(
          new TicketComment
          {
            TicketId = dup.Id,
            UserId = userId,
            Comment =
                  $"🔀 This ticket was " +
                  $"merged into " +
                  $"#TN{original.TicketNumber}. " +
                  $"Please follow up on " +
                  $"the original ticket.",
            IsInternal = false,
            Source = "system",
            OrganizationId = orgId
          });

      // Add note to original
      _context.TicketComments.Add(
          new TicketComment
          {
            TicketId = original.Id,
            UserId = userId,
            Comment =
                  $"🔀 Ticket " +
                  $"#TN{dup.TicketNumber} " +
                  $"was merged into " +
                  $"this ticket.",
            IsInternal = true,
            Source = "system",
            OrganizationId = orgId
          });

      merged++;
    }

    await _context.SaveChangesAsync();

    return Ok(new
    {
      message =
            $"{merged} ticket(s) merged " +
            $"into #TN" +
            $"{original.TicketNumber}",
      originalId = original.Id,
      mergedCount = merged
    });
  }

  // ════════════════════════════════════
  // 4. AI TICKET SUMMARY
  // One-line summary for agents
  // ════════════════════════════════════
  [HttpGet("summary/{ticketId}")]
  public async Task<IActionResult>
      GetTicketSummary(Guid ticketId)
  {
    var orgId = _tenant.OrganizationId!.Value;

    var ticket = await _context.Tickets
        .AsNoTracking()
        .Include(t => t.CreatedBy)
        .Include(t => t.AssignedTo)
        .Include(t => t.Comments)
        .FirstOrDefaultAsync(t =>
            t.Id == ticketId);

    if (ticket == null)
      return NotFound();

    var commentCount =
        ticket.Comments.Count;
    var lastComment = ticket.Comments
        .OrderByDescending(c => c.CreatedAt)
        .FirstOrDefault();

    var ageHours = (int)(DateTime.UtcNow -
        ticket.CreatedAt).TotalHours;
    var ageDays = ageHours / 24;

    // Build smart summary
    var summaryParts =
        new List<string>();

    // Issue description (shortened + HTML stripped)
    var desc = StripHtml(
        ticket.Description ?? ticket.Title);
    if (desc.Length > 150)
      desc = desc.Substring(0, 147)
          + "...";

    summaryParts.Add(
        $"Customer reporting: {desc}");

    // Age
    if (ageDays > 0)
      summaryParts.Add(
          $"Open for {ageDays}d");
    else
      summaryParts.Add(
          $"Opened {ageHours}h ago");

    // Comments
    if (commentCount > 0)
      summaryParts.Add(
          $"{commentCount} response(s)");

    // SLA
    if (ticket.IsSlaBreached)
      summaryParts.Add(
          "⚠️ SLA breached");
    else if (ticket.SlaDeadline.HasValue)
    {
      var remaining =
          ticket.SlaDeadline.Value -
          DateTime.UtcNow;
      if (remaining.TotalHours < 2)
        summaryParts.Add(
            $"⚡ SLA due in " +
            $"{(int)remaining
                .TotalMinutes}min");
      else if (remaining.TotalHours < 24)
        summaryParts.Add(
            $"SLA due in " +
            $"{(int)remaining
                .TotalHours}h");
    }

    // Last activity
    if (lastComment != null)
    {
      var lastAge =
          (DateTime.UtcNow -
           lastComment.CreatedAt)
          .TotalHours;
      summaryParts.Add(
          $"Last reply " +
          $"{(lastAge < 1 ? "just now" : $"{(int)lastAge}h ago")}");
    }

    // Priority warning
    if (ticket.Priority ==
        TicketPriority.Critical)
      summaryParts.Add(
          "🔴 CRITICAL priority");
    else if (ticket.Priority ==
        TicketPriority.High)
      summaryParts.Add(
          "🟠 High priority");

    var oneLiner =
        string.Join(" · ", summaryParts);

    // Suggested action
    string action;
    if (ticket.IsSlaBreached)
      action =
          "Escalate immediately — " +
          "SLA already breached.";
    else if (!ticket.AssignedToUserId
        .HasValue)
      action =
          "Assign to an agent right away.";
    else if (commentCount == 0)
      action =
          "No response yet — " +
          "reply to customer.";
    else if (ticket.Priority ==
        TicketPriority.Critical)
      action =
          "Critical issue — " +
          "follow up immediately.";
    else
      action =
          "Review latest comment " +
          "and update status.";

    // Sentiment (basic)
    var sentiment = "Neutral";
    var lowerDesc =
        StripHtml(ticket.Description ?? "")
        .ToLower();
    if (lowerDesc.Contains("urgent") ||
        lowerDesc.Contains("asap") ||
        lowerDesc.Contains("critical") ||
        lowerDesc.Contains("immediately"))
      sentiment = "Frustrated";
    else if (lowerDesc.Contains("thank") ||
        lowerDesc.Contains("great") ||
        lowerDesc.Contains("appreciate"))
      sentiment = "Positive";

    // Tags analysis
    var tags =
        (ticket.Tags ?? "")
        .Split(',')
        .Where(t => !string.IsNullOrEmpty(
            t.Trim()))
        .Select(t => t.Trim())
        .ToList();

    return Ok(new
    {
      ticketId,
      oneLiner,
      suggestedAction = action,
      sentiment,
      keyFacts = summaryParts,
      stats = new
      {
        ageHours,
        ageDays,
        commentCount,
        isBreached = ticket.IsSlaBreached,
        priority =
                ticket.Priority.ToString(),
        status = ticket.Status.ToString(),
        tags
      },
      assignedTo =
            ticket.AssignedTo?.FullName,
      createdBy =
            ticket.CreatedBy?.FullName,
      generatedAt = DateTime.UtcNow
    });
  }

  // ── HTML Strip helper ────────────────
  private static string StripHtml(
      string input)
  {
    if (string.IsNullOrWhiteSpace(input))
      return "";

    // Remove HTML tags
    var noTags = System.Text.RegularExpressions
        .Regex.Replace(input, "<[^>]*>", " ");

    // Decode common HTML entities
    noTags = noTags
        .Replace("&nbsp;", " ")
        .Replace("&amp;", "&")
        .Replace("&lt;", "<")
        .Replace("&gt;", ">")
        .Replace("&quot;", "\"")
        .Replace("&#39;", "'")
        .Replace("&apos;", "'");

    // Collapse whitespace
    noTags = System.Text.RegularExpressions
        .Regex.Replace(noTags, @"\s+", " ")
        .Trim();

    return noTags;
  }

  // ── Similarity helpers ───────────────
  private static List<string> GetWords(
      string text)
  {
    if (string.IsNullOrEmpty(text))
      return new List<string>();

    return text.ToLower()
        .Split(new[] {
                ' ', ',', '.', '!', '?',
                '-', '_', '/'
        }, StringSplitOptions
            .RemoveEmptyEntries)
        .Where(w => w.Length > 2)
        .ToList();
  }

  private static double GetSimilarity(
      List<string> words1,
      List<string> words2)
  {
    if (!words1.Any() || !words2.Any())
      return 0;

    var intersection =
        words1.Intersect(words2).Count();
    var union = words1.Union(words2).Count();

    return union > 0
        ? (double)intersection / union
        : 0;
  }
}

// DTOs
public class MergeTicketsDto
{
  public Guid OriginalTicketId { get; set; }
  public List<Guid> TicketIdsToClose
  { get; set; } = new();
  public string? Note { get; set; }
}
