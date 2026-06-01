using iM3Helpdesk.API.Middleware;
using iM3Helpdesk.API.Services;
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
public class AttachmentsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly IWebHostEnvironment _env;

  public AttachmentsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      IWebHostEnvironment env)
  {
    _context = context;
    _tenantService = tenantService;
    _env = env;
  }

  [HttpPost("upload/{ticketId}")]
  [RequestSizeLimit(10 * 1024 * 1024)] // 10MB
  public async Task<IActionResult> Upload(
      Guid ticketId, IFormFile file,
      [FromQuery] Guid? commentId = null)
  {
    if (file == null || file.Length == 0)
      return BadRequest(new { message = "No file provided" });

    var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    if (!Guid.TryParse(userIdClaim, out var userId))
      return Unauthorized();

    // Create uploads folder
    var uploadPath = Path.Combine(_env.WebRootPath ?? "wwwroot", "uploads");
    Directory.CreateDirectory(uploadPath);

    var ext = Path.GetExtension(file.FileName);
    var uniqueFileName = $"{Guid.NewGuid()}{ext}";
    var filePath = Path.Combine(uploadPath, uniqueFileName);

    using (var stream = new FileStream(filePath, FileMode.Create))
    {
      await file.CopyToAsync(stream);
    }

    var attachment = new TicketAttachment
    {
      TicketId = ticketId,
      CommentId = commentId,
      FileName = file.FileName,
      FileUrl = $"/uploads/{uniqueFileName}",
      ContentType = file.ContentType,
      FileSize = file.Length,
      UploadedByUserId = userId,
      OrganizationId = _tenantService.OrganizationId!.Value
    };

    _context.TicketAttachments.Add(attachment);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      id = attachment.Id,
      fileName = attachment.FileName,
      fileUrl = attachment.FileUrl,
      contentType = attachment.ContentType,
      fileSize = attachment.FileSize
    });
  }

  [HttpGet("ticket/{ticketId}")]
  public async Task<IActionResult> GetByTicket(Guid ticketId)
  {
    var attachments = await _context.TicketAttachments
        .Include(a => a.UploadedBy)
        .Where(a => a.TicketId == ticketId)
        .OrderByDescending(a => a.UploadedAt)
        .Select(a => new
        {
          a.Id,
          a.FileName,
          a.FileUrl,
          a.ContentType,
          a.FileSize,
          a.UploadedAt,
          a.CommentId,
          UploadedBy = a.UploadedBy!.FullName,
          IsImage = a.ContentType.StartsWith("image/"),
          SizeFormatted = FormatFileSize(a.FileSize)
        })
        .ToListAsync();

    return Ok(attachments);
  }

  [HttpDelete("{id}")]
  [RequirePermission("tickets", PermissionAction.Edit)]
  public async Task<IActionResult> Delete(Guid id)
  {
    var attachment = await _context.TicketAttachments.FindAsync(id);
    if (attachment == null) return NotFound();

    var filePath = Path.Combine(
        _env.WebRootPath ?? "wwwroot",
        attachment.FileUrl.TrimStart('/'));

    if (System.IO.File.Exists(filePath))
      System.IO.File.Delete(filePath);

    _context.TicketAttachments.Remove(attachment);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Attachment deleted" });
  }

  private static string FormatFileSize(long bytes)
  {
    if (bytes < 1024) return $"{bytes} B";
    if (bytes < 1024 * 1024) return $"{bytes / 1024} KB";
    return $"{bytes / (1024 * 1024)} MB";
  }
}
