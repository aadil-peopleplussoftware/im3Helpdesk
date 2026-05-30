using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/comments/{commentId}/reactions")]
[Authorize]
public class CommentReactionsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public CommentReactionsController(
        ApplicationDbContext context,
        ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        Guid.TryParse(claim, out var id);
        return id;
    }

    /// <summary>
    /// GET /api/comments/{commentId}/reactions
    /// Returns { counts: { like: 2, heart: 1 }, myReaction: "like" | null }
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(Guid commentId)
    {
        var rows = await _context.CommentReactions
            .AsNoTracking()
            .Where(r => r.CommentId == commentId)
            .Select(r => new { r.UserId, r.ReactionType })
            .ToListAsync();

        var counts = rows
            .GroupBy(r => r.ReactionType)
            .ToDictionary(g => g.Key, g => g.Count());

        var userId = GetUserId();
        var myReaction = rows
            .FirstOrDefault(r => r.UserId == userId)
            ?.ReactionType;

        return Ok(new { counts, myReaction });
    }

    /// <summary>
    /// POST /api/comments/{commentId}/reactions
    /// Body: { reactionType: "like" }
    /// Toggles: same type → removes, different type → replaces.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Toggle(
        Guid commentId,
        [FromBody] ToggleReactionDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.ReactionType))
            return BadRequest(new { message = "reactionType is required" });

        var userId = GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var orgId = _tenantService.OrganizationId;
        if (orgId == null) return Unauthorized();

        // Verify the comment exists (tenant-filtered)
        var exists = await _context.TicketComments
            .AnyAsync(c => c.Id == commentId);
        if (!exists) return NotFound();

        var existing = await _context.CommentReactions
            .FirstOrDefaultAsync(r =>
                r.CommentId == commentId &&
                r.UserId == userId);

        if (existing != null)
        {
            if (existing.ReactionType == dto.ReactionType)
            {
                // Same reaction → remove (toggle off)
                _context.CommentReactions.Remove(existing);
            }
            else
            {
                // Different reaction → replace
                existing.ReactionType = dto.ReactionType;
                existing.CreatedAt = DateTime.UtcNow;
            }
        }
        else
        {
            _context.CommentReactions.Add(new CommentReaction
            {
                CommentId = commentId,
                UserId = userId,
                ReactionType = dto.ReactionType,
                OrganizationId = orgId.Value
            });
        }

        await _context.SaveChangesAsync();

        // Return fresh counts + caller's reaction
        var rows = await _context.CommentReactions
            .AsNoTracking()
            .Where(r => r.CommentId == commentId)
            .Select(r => new { r.UserId, r.ReactionType })
            .ToListAsync();

        var counts = rows
            .GroupBy(r => r.ReactionType)
            .ToDictionary(g => g.Key, g => g.Count());

        var myReaction = rows
            .FirstOrDefault(r => r.UserId == userId)
            ?.ReactionType;

        return Ok(new { counts, myReaction });
    }
}

public class ToggleReactionDto
{
    public string ReactionType { get; set; } = string.Empty;
}
