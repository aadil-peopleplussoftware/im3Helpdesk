using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public ReportsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to ?? DateTime.UtcNow;

        var tickets = await _context.Tickets
            .Where(t => t.CreatedAt >= fromDate && t.CreatedAt <= toDate)
            .ToListAsync();

        var byStatus = tickets
            .GroupBy(t => t.Status.ToString())
            .Select(g => new { status = g.Key, count = g.Count() })
            .ToList();

        var byPriority = tickets
            .GroupBy(t => t.Priority.ToString())
            .Select(g => new { priority = g.Key, count = g.Count() })
            .ToList();

        var byCategory = tickets
            .GroupBy(t => t.Category)
            .Select(g => new { category = g.Key, count = g.Count() })
            .ToList();

        var avgResolutionTime = tickets
            .Where(t => t.ResolvedAt.HasValue)
            .Select(t => (t.ResolvedAt!.Value - t.CreatedAt).TotalHours)
            .DefaultIfEmpty(0)
            .Average();

        return Ok(new
        {
            totalTickets = tickets.Count,
            byStatus,
            byPriority,
            byCategory,
            avgResolutionHours = Math.Round(avgResolutionTime, 1),
            period = new { from = fromDate, to = toDate }
        });
    }

    [HttpGet("export-csv")]
    public async Task<IActionResult> ExportCsv(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-30);
        var toDate = to ?? DateTime.UtcNow;

        var tickets = await _context.Tickets
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedTo)
            .Where(t => t.CreatedAt >= fromDate && t.CreatedAt <= toDate)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        var sb = new StringBuilder();
        sb.AppendLine("Id,Title,Category,Status,Priority,CreatedBy,AssignedTo,CreatedAt,ResolvedAt");

        foreach (var t in tickets)
        {
            sb.AppendLine(
                $"{t.Id}," +
                $"\"{t.Title}\"," +
                $"{t.Category}," +
                $"{t.Status}," +
                $"{t.Priority}," +
                $"{t.CreatedBy?.FullName}," +
                $"{t.AssignedTo?.FullName ?? "Unassigned"}," +
                $"{t.CreatedAt:yyyy-MM-dd HH:mm}," +
                $"{(t.ResolvedAt.HasValue ? t.ResolvedAt.Value.ToString("yyyy-MM-dd HH:mm") : "")}");
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv",
            $"tickets-report-{DateTime.Now:yyyy-MM-dd}.csv");
    }
}