using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

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

  // ─────────────────────────────────────
  // Helper: get current userId
  // ─────────────────────────────────────
  private Guid? GetUserId()
  {
    var claim =
        User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    return Guid.TryParse(claim, out var id) ? id : null;
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase
  // Social feed — newest first
  // ─────────────────────────────────────
  [HttpGet]
  public async Task<IActionResult> GetAll(
      [FromQuery] string? category,
      [FromQuery] string? search,
      [FromQuery] bool publishedOnly = true)
  {
    var userId = GetUserId();

    var query = _context.KbArticles
        .Include(a => a.CreatedBy)
        .Include(a => a.Reactions)
        .Include(a => a.Comments)
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
        .OrderByDescending(a => a.CreatedAt) // newest first like social feed
        .ToListAsync();

    var result = articles.Select(a => new
    {
      a.Id,
      a.Title,
      a.Content,
      a.Category,
      a.Tags,
      a.IsPublished,
      a.ViewCount,
      a.CreatedAt,
      a.UpdatedAt,
      a.MediaUrl,
      a.MediaType,
      CreatedBy = a.CreatedBy!.FullName,
      CreatedByUserId = a.CreatedByUserId,
      IsOwner = userId.HasValue && a.CreatedByUserId == userId.Value,
      LikeCount = a.Reactions.Count(r => r.ReactionType == "like"),
      DislikeCount = a.Reactions.Count(r => r.ReactionType == "dislike"),
      CommentCount = a.Comments.Count,
      MyReaction = userId.HasValue
          ? a.Reactions
              .FirstOrDefault(r => r.UserId == userId.Value)
              ?.ReactionType ?? ""
          : "",
      ContentPreview = a.Content.Length > 200
          ? a.Content.Substring(0, 200) + "..."
          : a.Content
    });

    return Ok(result);
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/{id}
  // ─────────────────────────────────────
  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var userId = GetUserId();

    var article = await _context.KbArticles
        .Include(a => a.CreatedBy)
        .Include(a => a.Reactions)
            .ThenInclude(r => r.User)
        .Include(a => a.Comments.OrderBy(c => c.CreatedAt))
            .ThenInclude(c => c.User)
        .FirstOrDefaultAsync(a => a.Id == id);

    if (article == null)
      return NotFound(new { message = "Post not found" });

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
      article.MediaUrl,
      article.MediaType,
      CreatedBy = article.CreatedBy!.FullName,
      CreatedByUserId = article.CreatedByUserId,
      IsOwner = userId.HasValue && article.CreatedByUserId == userId.Value,
      LikeCount = article.Reactions.Count(r => r.ReactionType == "like"),
      DislikeCount = article.Reactions.Count(r => r.ReactionType == "dislike"),
      MyReaction = userId.HasValue
          ? article.Reactions
              .FirstOrDefault(r => r.UserId == userId.Value)
              ?.ReactionType ?? ""
          : "",
      Comments = article.Comments.Select(c => new
      {
        c.Id,
        c.Text,
        c.CreatedAt,
        c.UpdatedAt,
        c.UserId,
        UserName = c.User?.FullName ?? "Unknown",
        IsOwner = userId.HasValue && c.UserId == userId.Value
      }),
      Reactions = article.Reactions
          .GroupBy(r => r.ReactionType)
          .Select(g => new
          {
            Type = g.Key,
            Count = g.Count(),
            Users = g.Select(r => r.User?.FullName).Take(5)
          })
    });
  }

  // ─────────────────────────────────────
  // POST /api/KnowledgeBase
  // Create post
  // ─────────────────────────────────────
  [HttpPost]
  public async Task<IActionResult> Create(
      [FromBody] CreateArticleDto dto)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var article = new KbArticle
    {
      Title = dto.Title,
      Content = dto.Content,
      Category = dto.Category,
      Tags = dto.Tags,
      IsPublished = dto.IsPublished,
      MediaUrl = dto.MediaUrl ?? "",
      MediaType = dto.MediaType ?? "none",
      OrganizationId = _tenantService.OrganizationId!.Value,
      CreatedByUserId = userId.Value
    };

    _context.KbArticles.Add(article);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Post created", id = article.Id });
  }

  // ─────────────────────────────────────
  // PUT /api/KnowledgeBase/{id}
  // Update — only owner can update
  // ─────────────────────────────────────
  [HttpPut("{id}")]
  public async Task<IActionResult> Update(
      Guid id, [FromBody] CreateArticleDto dto)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    // ✅ Only the creator can edit their own post
    if (article.CreatedByUserId != userId.Value)
      return Forbid();

    article.Title = dto.Title;
    article.Content = dto.Content;
    article.Category = dto.Category;
    article.Tags = dto.Tags;
    article.IsPublished = dto.IsPublished;
    article.MediaUrl = dto.MediaUrl ?? article.MediaUrl;
    article.MediaType = dto.MediaType ?? article.MediaType;
    article.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Post updated" });
  }

  // ─────────────────────────────────────
  // DELETE /api/KnowledgeBase/{id}
  // Delete — only owner can delete
  // ─────────────────────────────────────
  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    // ✅ Only the creator can delete their own post
    if (article.CreatedByUserId != userId.Value)
      return Forbid();

    _context.KbArticles.Remove(article);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Post deleted" });
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/categories
  // ─────────────────────────────────────
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

  // ─────────────────────────────────────
  // POST /api/KnowledgeBase/{id}/react
  // Like or Dislike a post
  // ─────────────────────────────────────
  [HttpPost("{id}/react")]
  public async Task<IActionResult> React(
      Guid id, [FromBody] ReactDto dto)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var article = await _context.KbArticles
        .Include(a => a.Reactions)
        .FirstOrDefaultAsync(a => a.Id == id);

    if (article == null) return NotFound();

    var existing = article.Reactions
        .FirstOrDefault(r => r.UserId == userId.Value);

    if (existing != null)
    {
      if (existing.ReactionType == dto.ReactionType)
      {
        // Toggle OFF: remove reaction
        _context.KbReactions.Remove(existing);
      }
      else
      {
        // Switch reaction type
        existing.ReactionType = dto.ReactionType;
      }
    }
    else
    {
      _context.KbReactions.Add(new KbReaction
      {
        ArticleId = id,
        UserId = userId.Value,
        ReactionType = dto.ReactionType,
        OrganizationId = _tenantService.OrganizationId!.Value
      });
    }

    await _context.SaveChangesAsync();

    // Return updated counts
    var reactions = await _context.KbReactions
        .Where(r => r.ArticleId == id)
        .ToListAsync();

    var myReaction = reactions
        .FirstOrDefault(r => r.UserId == userId.Value)
        ?.ReactionType ?? "";

    return Ok(new
    {
      likeCount = reactions.Count(r => r.ReactionType == "like"),
      dislikeCount = reactions.Count(r => r.ReactionType == "dislike"),
      myReaction
    });
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/{id}/comments
  // ─────────────────────────────────────
  [HttpGet("{id}/comments")]
  public async Task<IActionResult> GetComments(Guid id)
  {
    var userId = GetUserId();

    var comments = await _context.KbComments
        .Include(c => c.User)
        .Where(c => c.ArticleId == id)
        .OrderBy(c => c.CreatedAt)
        .Select(c => new
        {
          c.Id,
          c.Text,
          c.CreatedAt,
          c.UpdatedAt,
          c.UserId,
          UserName = c.User != null ? c.User.FullName : "Unknown",
          IsOwner = userId.HasValue && c.UserId == userId.Value
        })
        .ToListAsync();

    return Ok(comments);
  }

  // ─────────────────────────────────────
  // POST /api/KnowledgeBase/{id}/comments
  // Add a comment
  // ─────────────────────────────────────
  [HttpPost("{id}/comments")]
  public async Task<IActionResult> AddComment(
      Guid id, [FromBody] KbAddCommentDto dto)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    if (string.IsNullOrWhiteSpace(dto.Text))
      return BadRequest(new { message = "Comment cannot be empty" });

    var comment = new KbComment
    {
      ArticleId = id,
      UserId = userId.Value,
      Text = dto.Text.Trim(),
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.KbComments.Add(comment);
    await _context.SaveChangesAsync();

    // Return the new comment with user info
    var user = await _context.Users.FindAsync(userId.Value);

    return Ok(new
    {
      comment.Id,
      comment.Text,
      comment.CreatedAt,
      comment.UserId,
      UserName = user?.FullName ?? "Unknown",
      IsOwner = true
    });
  }

  // ─────────────────────────────────────
  // PUT /api/KnowledgeBase/comments/{commentId}
  // Edit a comment — only owner
  // ─────────────────────────────────────
  [HttpPut("comments/{commentId}")]
  public async Task<IActionResult> UpdateComment(
      Guid commentId, [FromBody] KbAddCommentDto dto)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var comment = await _context.KbComments.FindAsync(commentId);
    if (comment == null) return NotFound();

    if (comment.UserId != userId.Value) return Forbid();

    comment.Text = dto.Text.Trim();
    comment.UpdatedAt = DateTime.UtcNow;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Comment updated", text = comment.Text });
  }

  // ─────────────────────────────────────
  // DELETE /api/KnowledgeBase/comments/{commentId}
  // Delete a comment — only owner
  // ─────────────────────────────────────
  [HttpDelete("comments/{commentId}")]
  public async Task<IActionResult> DeleteComment(Guid commentId)
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var comment = await _context.KbComments.FindAsync(commentId);
    if (comment == null) return NotFound();

    if (comment.UserId != userId.Value) return Forbid();

    _context.KbComments.Remove(comment);
    await _context.SaveChangesAsync();
    return Ok(new { message = "Comment deleted" });
  }

  // ─────────────────────────────────────
  // POST /api/KnowledgeBase/{id}/view
  // Record a view
  // ─────────────────────────────────────
  [HttpPost("{id}/view")]
  public async Task<IActionResult> RecordView(Guid id)
  {
    var article = await _context.KbArticles.FindAsync(id);
    if (article == null) return NotFound();

    var userId = GetUserId();
    var today = DateTime.UtcNow.Date;

    var alreadyViewed = userId.HasValue && await _context.ActivityLogs
        .AnyAsync(a =>
            a.EntityId == id &&
            a.UserId == userId.Value &&
            a.Action == "Viewed" &&
            a.CreatedAt.Date == today);

    if (!alreadyViewed)
    {
      article.ViewCount++;

      if (userId.HasValue)
      {
        _context.ActivityLogs.Add(new ActivityLog
        {
          UserId = userId.Value,
          OrganizationId = _tenantService.OrganizationId!.Value,
          Action = "Viewed",
          Description = $"Viewed post: {article.Title}",
          EntityType = "KbArticle",
          EntityId = id
        });
      }

      await _context.SaveChangesAsync();
    }

    return Ok(new { viewCount = article.ViewCount });
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/{id}/viewers
  // Who viewed this post
  // ─────────────────────────────────────
  [HttpGet("{id}/viewers")]
  public async Task<IActionResult> GetViewers(Guid id)
  {
    var viewers = await _context.ActivityLogs
        .AsNoTracking()
        .Include(a => a.User)
        .Where(a =>
            a.EntityType == "KbArticle" &&
            a.EntityId == id &&
            a.Action == "Viewed")
        .GroupBy(a => a.UserId)
        .Select(g => new
        {
          UserId = g.Key,
          User = g.First().User != null
              ? g.First().User!.FullName
              : "Unknown",
          LastViewed = g.Max(x => x.CreatedAt),
          ViewCount = g.Count()
        })
        .OrderByDescending(x => x.LastViewed)
        .ToListAsync();

    var article = await _context.KbArticles
        .AsNoTracking()
        .Select(a => new { a.Id, a.ViewCount })
        .FirstOrDefaultAsync(a => a.Id == id);

    return Ok(new
    {
      viewCount = article?.ViewCount ?? 0,
      uniqueViewers = viewers.Count,
      viewers
    });
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/unread-count
  // ─────────────────────────────────────
  [HttpGet("unread-count")]
  public async Task<IActionResult> GetUnreadCount()
  {
    var userId = GetUserId();
    if (userId == null)
      return Ok(new { count = 0, articles = new List<object>() });

    var viewedIds = await _context.ActivityLogs
        .AsNoTracking()
        .Where(a =>
            a.UserId == userId.Value &&
            a.Action == "Viewed" &&
            a.EntityType == "KbArticle")
        .Select(a => a.EntityId)
        .Distinct()
        .ToListAsync();

    var unread = await _context.KbArticles
        .AsNoTracking()
        .Where(a => a.IsPublished && !viewedIds.Contains(a.Id))
        .OrderByDescending(a => a.CreatedAt)
        .Take(10)
        .Select(a => new { a.Id, a.Title, a.Category, a.CreatedAt })
        .ToListAsync();

    return Ok(new { count = unread.Count, articles = unread });
  }

  // ─────────────────────────────────────
  // POST /api/KnowledgeBase/upload-media
  // Upload image or video for a post
  // ─────────────────────────────────────
  [HttpPost("upload-media")]
  [DisableRequestSizeLimit]
  [RequestFormLimits(MultipartBodyLengthLimit = 104857600)] // 100MB
  [Consumes("multipart/form-data")]
  public async Task<IActionResult> UploadMedia(
      [FromForm] KbUploadMediaDto dto)
  {
    var file = dto.File;
    if (file == null || file.Length == 0)
      return BadRequest(new { message = "No file provided" });

    // Max 100MB
    if (file.Length > 100 * 1024 * 1024)
      return BadRequest(new { message = "File too large. Max 100MB." });

    var allowedImages = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
    var allowedVideos = new[] { ".mp4", ".mov", ".webm", ".avi" };

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    string mediaType;

    if (allowedImages.Contains(ext))
      mediaType = "image";
    else if (allowedVideos.Contains(ext))
      mediaType = "video";
    else
      return BadRequest(new { message = "File type not allowed." });

    var uploadsFolder = Path.Combine(
        Directory.GetCurrentDirectory(),
        "wwwroot", "kb-media");
    Directory.CreateDirectory(uploadsFolder);

    var fileName = $"{Guid.NewGuid()}{ext}";
    var filePath = Path.Combine(uploadsFolder, fileName);

    using (var stream = new FileStream(filePath, FileMode.Create))
      await file.CopyToAsync(stream);

    var url = $"/kb-media/{fileName}";

    return Ok(new { url, mediaType });
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/users-with-posts
  // List of users who have posted + post count
  // ─────────────────────────────────────
  [HttpGet("users-with-posts")]
  public async Task<IActionResult> GetUsersWithPosts()
  {
    var users = await _context.KbArticles
        .Include(a => a.CreatedBy)
        .Where(a => a.IsPublished)
        .GroupBy(a => a.CreatedByUserId)
        .Select(g => new
        {
          UserId = g.Key,
          UserName = g.First().CreatedBy != null
                        ? g.First().CreatedBy!.FullName
                        : "Unknown",
          PostCount = g.Count(),
          LastPost = g.Max(x => x.CreatedAt)
        })
        .OrderByDescending(x => x.PostCount)
        .ToListAsync();

    return Ok(users);
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/by-user/{userId}
  // All posts by a specific user
  // ─────────────────────────────────────
  [HttpGet("by-user/{userId}")]
  public async Task<IActionResult> GetByUser(
      Guid userId,
      [FromQuery] bool publishedOnly = true)
  {
    var currentUserId = GetUserId();

    var query = _context.KbArticles
        .Include(a => a.CreatedBy)
        .Include(a => a.Reactions)
        .Include(a => a.Comments)
        .Where(a => a.CreatedByUserId == userId);

    if (publishedOnly)
      query = query.Where(a => a.IsPublished);

    var articles = await query
        .OrderByDescending(a => a.CreatedAt)
        .ToListAsync();

    var result = articles.Select(a => new
    {
      a.Id,
      a.Title,
      a.Content,
      a.Category,
      a.Tags,
      a.IsPublished,
      a.ViewCount,
      a.CreatedAt,
      a.UpdatedAt,
      a.MediaUrl,
      a.MediaType,
      CreatedBy = a.CreatedBy!.FullName,
      CreatedByUserId = a.CreatedByUserId,
      IsOwner = currentUserId.HasValue && a.CreatedByUserId == currentUserId.Value,
      LikeCount = a.Reactions.Count(r => r.ReactionType == "like"),
      DislikeCount = a.Reactions.Count(r => r.ReactionType == "dislike"),
      CommentCount = a.Comments.Count,
      MyReaction = currentUserId.HasValue
          ? a.Reactions.FirstOrDefault(r => r.UserId == currentUserId.Value)?.ReactionType ?? ""
          : "",
      ContentPreview = a.Content.Length > 200
          ? a.Content.Substring(0, 200) + "..."
          : a.Content
    });

    return Ok(result);
  }

  // ─────────────────────────────────────
  // GET /api/KnowledgeBase/my-posts
  // Current user's own posts (incl. drafts)
  // ─────────────────────────────────────
  [HttpGet("my-posts")]
  public async Task<IActionResult> GetMyPosts()
  {
    var userId = GetUserId();
    if (userId == null) return Unauthorized();

    var articles = await _context.KbArticles
        .Include(a => a.CreatedBy)
        .Include(a => a.Reactions)
        .Include(a => a.Comments)
        .Where(a => a.CreatedByUserId == userId.Value)
        .OrderByDescending(a => a.CreatedAt)
        .ToListAsync();

    var result = articles.Select(a => new
    {
      a.Id,
      a.Title,
      a.Content,
      a.Category,
      a.Tags,
      a.IsPublished,
      a.ViewCount,
      a.CreatedAt,
      a.UpdatedAt,
      a.MediaUrl,
      a.MediaType,
      CreatedBy = a.CreatedBy!.FullName,
      CreatedByUserId = a.CreatedByUserId,
      IsOwner = true,
      LikeCount = a.Reactions.Count(r => r.ReactionType == "like"),
      DislikeCount = a.Reactions.Count(r => r.ReactionType == "dislike"),
      CommentCount = a.Comments.Count,
      MyReaction = a.Reactions
          .FirstOrDefault(r => r.UserId == userId.Value)?.ReactionType ?? "",
      ContentPreview = a.Content.Length > 200
          ? a.Content.Substring(0, 200) + "..."
          : a.Content
    });

    return Ok(result);
  }
}

// ─────────────────────────────────────
// DTOs
// ─────────────────────────────────────
public class CreateArticleDto
{
  public string Title { get; set; } = string.Empty;
  public string Content { get; set; } = string.Empty;
  public string Category { get; set; } = string.Empty;
  public string Tags { get; set; } = string.Empty;
  public bool IsPublished { get; set; } = true;
  public string? MediaUrl { get; set; }
  public string? MediaType { get; set; }
}

public class ReactDto
{
  // "like" or "dislike"
  public string ReactionType { get; set; } = "like";
}

public class KbAddCommentDto
{
  public string Text { get; set; } = string.Empty;
}

public class KbUploadMediaDto
{
  public IFormFile File { get; set; } = default!;
}
