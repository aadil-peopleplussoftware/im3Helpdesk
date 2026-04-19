using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class KnowledgeBaseController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;

  public KnowledgeBaseController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService)
  {
    _context = context;
    _tenantService = tenantService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] string? category,
      [FromQuery] string? search,
      [FromQuery] bool publishedOnly = true)
  {
    var query = _context.KbArticles
        .Include(a => a.CreatedBy)
        .AsQueryable();

    if (publishedOnly)
      query = query.Where(a => a.IsPublished);

    if (!string.IsNullOrEmpty(category))
      query = query.Where(a => a.Category == category);

    if (!string.IsNullOrEmpty(search))
      query = query.Where(a =>
          a.Title.Contains(search) ||
          a.Content.Contains(search) ||
          a.Tags.Contains(search));

    var articles = await query
        .OrderByDescending(a => a.ViewCount)
        .Select(a => new
        {
          a.Id,
          a.Title,
          a.Category,
          a.Tags,
          a.IsPublished,
          a.ViewCount,
          a.CreatedAt,
          a.UpdatedAt,
          CreatedBy = a.CreatedBy!.FullName,
          ContentPreview = a.Content.Length > 150
                ? a.Content.Substring(0, 150) + "..."
                : a.Content
        })
        .ToListAsync();

    return Ok(articles);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var article = await _context.KbArticles
        .Include(a => a.CreatedBy)
        .FirstOrDefaultAsync(a => a.Id == id);

    if (article == null)
      return NotFound(new { message = "Article not found" });

    article.ViewCount++;
    await _context.SaveChangesAsync();

    return Ok(new
    {
      article.Id,
      article.Title,
      article.Content,
      article.Category,
      article.Tags,
      article.IsPublished,
      article.ViewCount,
      article.CreatedAt,
      article.UpdatedAt,
      CreatedBy = article.CreatedBy!.FullName
    });
  }

  [HttpPost]
  public async Task<IActionResult> Create([FromBody] CreateArticleDto dto)
  {
    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;

    if (!Guid.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    var article = new KbArticle
    {
      Title = dto.Title,
      Content = dto.Content,
      Category = dto.Category,
      Tags = dto.Tags,
      IsPublished = dto.IsPublished,
      OrganizationId = _tenantService.OrganizationId!.Value,
      CreatedByUserId = userId
    };

    _context.KbArticles.Add(article);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Article created", id = article.Id });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> Update(Guid id,
      [FromBody] CreateArticleDto dto)
  {
    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    article.Title = dto.Title;
    article.Content = dto.Content;
    article.Category = dto.Category;
    article.Tags = dto.Tags;
    article.IsPublished = dto.IsPublished;
    article.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Article updated" });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    _context.KbArticles.Remove(article);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Article deleted" });
  }

  [HttpGet("categories")]
  public async Task<IActionResult> GetCategories()
  {
    var categories = await _context.KbArticles
        .Where(a => a.IsPublished)
        .Select(a => a.Category)
        .Distinct()
        .ToListAsync();

    return Ok(categories);
  }

  [HttpPost("{id}/view")]
  public async Task<IActionResult> RecordView(Guid id)
  {
    var article = await _context.KbArticles
        .FindAsync(id);
    if (article == null) return NotFound();

    article.ViewCount = (article.ViewCount) + 1;
    await _context.SaveChangesAsync();

    return Ok();
  }

  [HttpGet("{id}/viewers")]
  public async Task<IActionResult> GetViewers(Guid id)
  {
    // Get recent activity logs for this article
    var viewers = await _context.ActivityLogs
        .AsNoTracking()
        .Where(a =>
            a.EntityType == "KbArticle" &&
            a.EntityId == id &&
            a.Action == "Viewed")
        .OrderByDescending(a => a.CreatedAt)
        .Take(20)
        .Select(a => new
        {
          a.Id,
          User = a.User != null
                ? a.User.FullName : "Unknown",
          UserPhoto = a.User != null
                ? a.User.PhotoUrl : null,
          a.CreatedAt
        })
        .ToListAsync();

    return Ok(new
    {
      viewCount = viewers.Count,
      viewers
    });
  }

}

public class CreateArticleDto
{
  public string Title { get; set; } = string.Empty;
  public string Content { get; set; } = string.Empty;
  public string Category { get; set; } = string.Empty;
  public string Tags { get; set; } = string.Empty;
  public bool IsPublished { get; set; } = true;
}
