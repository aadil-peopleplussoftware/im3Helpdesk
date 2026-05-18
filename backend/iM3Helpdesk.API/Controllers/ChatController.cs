using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using iM3Helpdesk.API.DTOs.Chat;


namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenant;
  private readonly IWebHostEnvironment _env;

  public ChatController(
      ApplicationDbContext context,
      ICurrentTenantService tenant,
      IWebHostEnvironment env)
  {
    _context = context;
    _tenant = tenant;
    _env = env;
  }

  private Guid GetUserId()
  {
    var c = User.FindFirst(
        ClaimTypes.NameIdentifier)?.Value
        ?? User.FindFirst("sub")?.Value;
    Guid.TryParse(c, out var id);
    return id;
  }

  private static Guid GuidCombine(
      Guid a, Guid b)
  {
    var ba = a.ToByteArray();
    var bb = b.ToByteArray();
    var cb = new byte[16];
    for (int i = 0; i < 16; i++)
      cb[i] = (byte)(ba[i] ^ bb[i]);
    return new Guid(cb);
  }

  [HttpGet("users")]
  public async Task<IActionResult>
      GetChatUsers()
  {
    try
    {
      var myId = GetUserId();
      if (_tenant.OrganizationId == null)
        return Unauthorized();

      var orgId =
          _tenant.OrganizationId.Value;

      var users = await _context.Users
          .IgnoreQueryFilters()
          .AsNoTracking()
          .Where(u =>
              u.OrganizationId == orgId &&
              u.Id != myId &&
              u.Role != UserRole.Customer) 
          .Select(u => new
          {
            u.Id,
            u.FullName,
            u.Email,
            u.PhotoUrl,
            Role = u.Role.ToString()
          })
          .ToListAsync();

      if (!users.Any())
        return Ok(new List<object>());

      var userIds = users
          .Select(u => u.Id).ToList();

      // Online statuses
      var statuses = await _context
          .UserOnlineStatuses
          .AsNoTracking()
          .Where(s =>
              userIds.Contains(s.UserId))
          .ToDictionaryAsync(s => s.UserId);

      // Unread counts
      var unreadList = await _context
          .ChatMessages
          .AsNoTracking()
          .Where(m =>
              m.ReceiverId == myId &&
              !m.IsRead &&
              userIds.Contains(m.SenderId))
          .GroupBy(m => m.SenderId)
          .Select(g => new
          {
            SenderId = g.Key,
            Count = g.Count()
          })
          .ToListAsync();

      var unreadDict = unreadList
          .ToDictionary(
              x => x.SenderId,
              x => x.Count);

      // Last messages
      var recentMsgs = await _context
          .ChatMessages
          .AsNoTracking()
          .Where(m =>
              m.OrganizationId == orgId &&
              m.GroupId == null &&
              (m.SenderId == myId ||
               m.ReceiverId == myId))
          .OrderByDescending(m =>
              m.CreatedAt)
          .Take(500)
          .Select(m => new
          {
            m.ConversationId,
            m.Content,
            m.CreatedAt,
            m.SenderId,
            m.MessageType,
            m.AttachmentName
          })
          .ToListAsync();

      var lastMsgDict = recentMsgs
          .GroupBy(m => m.ConversationId)
          .ToDictionary(
              g => g.Key,
              g => g.First());

      var result = users.Select(u =>
      {
        var convoId =
            GuidCombine(myId, u.Id);

        statuses.TryGetValue(u.Id,
            out var status);
        unreadDict.TryGetValue(u.Id,
            out var unread);
        lastMsgDict.TryGetValue(convoId,
            out var lastMsg);

        string? lastContent = null;
        if (lastMsg != null)
        {
          lastContent =
              lastMsg.MessageType == "text"
              ? lastMsg.Content
              : lastMsg.MessageType
                  == "image"
                  ? "📷 Photo"
                  : $"📎 {lastMsg.AttachmentName}";
        }

        return new
        {
          id = u.Id,
          fullName = u.FullName,
          email = u.Email,
          photoUrl = u.PhotoUrl,
          role = u.Role,
          isOnline =
                status?.IsOnline ?? false,
          lastSeen = status?.LastSeen,
          unreadCount = unread,
          lastMessage = lastMsg == null
                ? null
                : (object)new
                {
                  content = lastContent,
                  createdAt =
                        lastMsg.CreatedAt,
                  isFromMe =
                        lastMsg.SenderId
                            == myId
                },
          conversationId = convoId
        };
      })
      .OrderByDescending(u =>
          (u.lastMessage as dynamic)
              ?.createdAt
              ?? DateTime.MinValue)
      .ToList();

      return Ok(result);
    }
    catch (Exception ex)
    {
      return StatusCode(500, new
      {
        error = ex.Message,
        detail = ex.InnerException?.Message
      });
    }
  }

  [HttpGet("messages/{userId}")]
  public async Task<IActionResult>
      GetMessages(Guid userId,
          [FromQuery] int page = 1,
          [FromQuery] int pageSize = 50)
  {
    var myId = GetUserId();

    var msgs = await _context.ChatMessages
        .AsNoTracking()
        .Include(m => m.Sender)
        .Where(m =>
            m.GroupId == null &&
            ((m.SenderId == myId &&
                m.ReceiverId == userId) ||
             (m.SenderId == userId &&
                m.ReceiverId == myId)))
        .OrderBy(m => m.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(m => new
        {
          m.Id,
          m.Content,
          m.SenderId,
          m.ReceiverId,
          m.CreatedAt,
          m.IsRead,
          m.ReadAt,
          m.MessageType,
          m.AttachmentUrl,
          m.AttachmentName,
          m.AttachmentType,
          m.AttachmentSize,
          IsFromMe = m.SenderId == myId,
          SenderName = m.Sender != null
                ? m.Sender.FullName : "",
          SenderPhoto = m.Sender != null
                ? m.Sender.PhotoUrl : null
        })
        .ToListAsync();

    // Mark as read
    var unread = await _context.ChatMessages
        .Where(m =>
            m.SenderId == userId &&
            m.ReceiverId == myId &&
            !m.IsRead)
        .ToListAsync();

    unread.ForEach(m =>
    {
      m.IsRead = true;
      m.ReadAt = DateTime.UtcNow;
    });

    if (unread.Any())
      await _context.SaveChangesAsync();

    return Ok(msgs);
  }

  [HttpPost("upload")]
  public async Task<IActionResult>
      UploadFile(IFormFile file)
  {
    if (file == null || file.Length == 0)
      return BadRequest("No file");

    if (file.Length > 50 * 1024 * 1024)
      return BadRequest("Max 50MB");

    var uploadDir = Path.Combine(
        _env.WebRootPath ?? "wwwroot",
        "chat-uploads");

    Directory.CreateDirectory(uploadDir);

    var ext = Path.GetExtension(
        file.FileName).ToLowerInvariant();
    var fileName =
        $"{Guid.NewGuid()}{ext}";
    var fullPath = Path.Combine(
        uploadDir, fileName);

    using (var stream =
        System.IO.File.Create(fullPath))
      await file.CopyToAsync(stream);

    var url = $"/chat-uploads/{fileName}";

    // Detect type
    var isImage = new[]
    {
            ".jpg", ".jpeg", ".png",
            ".gif", ".webp", ".bmp", ".svg"
        }.Contains(ext);

    return Ok(new
    {
      url,
      name = file.FileName,
      size = file.Length,
      type = file.ContentType,
      isImage,
      messageType =
            isImage ? "image" : "file"
    });
  }

  [HttpGet("groups")]
  public async Task<IActionResult>
      GetGroups()
  {
    var myId = GetUserId();
    var orgId = _tenant.OrganizationId!.Value;

    // Groups where I am a member
    var myGroupIds = await _context
        .ChatGroupMembers
        .Where(m => m.UserId == myId)
        .Select(m => m.GroupId)
        .ToListAsync();

    var groups = await _context.ChatGroups
        .AsNoTracking()
        .Include(g => g.Members)
            .ThenInclude(m => m.User)
        .Where(g =>
            g.OrganizationId == orgId &&
            myGroupIds.Contains(g.Id))
        .Select(g => new
        {
          g.Id,
          g.Name,
          g.Description,
          g.CreatedAt,
          MemberCount = g.Members.Count,
          Members = g.Members
                .Select(m => new
                {
                  m.UserId,
                  FullName =
                        m.User != null
                            ? m.User.FullName
                            : "",
                  PhotoUrl =
                        m.User != null
                            ? m.User.PhotoUrl
                            : null
                })
                .ToList()
        })
        .ToListAsync();

    // Get last message + unread for each group
    var groupLastMsgs = await _context
        .ChatMessages
        .AsNoTracking()
        .Where(m =>
            m.GroupId != null &&
            myGroupIds.Contains(
                m.GroupId.Value))
        .OrderByDescending(m => m.CreatedAt)
        .Take(200)
        .ToListAsync();

    var result = groups.Select(g =>
    {
      var lastMsg = groupLastMsgs
          .FirstOrDefault(m =>
              m.GroupId == g.Id);

      return new
      {
        g.Id,
        g.Name,
        g.Description,
        g.CreatedAt,
        g.MemberCount,
        g.Members,
        isGroup = true,
        lastMessage = lastMsg == null
              ? null : (object)new
              {
                content = lastMsg.Content,
                createdAt = lastMsg.CreatedAt,
                isFromMe =
                      lastMsg.SenderId == myId
              }
      };
    })
    .OrderByDescending(g =>
        (g.lastMessage as dynamic)
            ?.createdAt
            ?? DateTime.MinValue)
    .ToList();

    return Ok(result);
  }


  [HttpPost("groups/{groupId}/members")]
  public async Task<IActionResult> AddGroupMembers(
      Guid groupId,
      [FromBody] ChatAddMembersDto dto)
  {
    var myId = GetUserId();

    var isMember = await _context.ChatGroupMembers
        .AnyAsync(m =>
            m.GroupId == groupId &&
            m.UserId == myId);

    if (!isMember) return Forbid();

    var existing = await _context.ChatGroupMembers
        .Where(m => m.GroupId == groupId)
        .Select(m => m.UserId)
        .ToListAsync();

    foreach (var uid in dto.MemberIds)
    {
      if (!existing.Contains(uid))
      {
        _context.ChatGroupMembers.Add(
            new ChatGroupMember
            {
              GroupId = groupId,
              UserId = uid
            });
      }
    }

    await _context.SaveChangesAsync();
    return Ok(new { message = "Members added" });
  }

  [HttpGet("group/{groupId}/messages")]
  public async Task<IActionResult>
      GetGroupMessages(Guid groupId,
          [FromQuery] int page = 1,
          [FromQuery] int pageSize = 50)
  {
    var myId = GetUserId();

    // Check membership
    var isMember = await _context
        .ChatGroupMembers
        .AnyAsync(m =>
            m.GroupId == groupId &&
            m.UserId == myId);

    if (!isMember)
      return Forbid();

    var msgs = await _context.ChatMessages
        .AsNoTracking()
        .Include(m => m.Sender)
        .Where(m => m.GroupId == groupId)
        .OrderBy(m => m.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(m => new
        {
          m.Id,
          m.Content,
          m.SenderId,
          m.GroupId,
          m.CreatedAt,
          m.MessageType,
          m.AttachmentUrl,
          m.AttachmentName,
          m.AttachmentType,
          IsFromMe = m.SenderId == myId,
          SenderName = m.Sender != null
                ? m.Sender.FullName : "",
          SenderPhoto = m.Sender != null
                ? m.Sender.PhotoUrl : null
        })
        .ToListAsync();

    return Ok(msgs);
  }

  [HttpPost("groups")]
  public async Task<IActionResult> CreateGroup(
      [FromBody] ChatCreateGroupDto dto)
  {
    var myId = GetUserId();
    var orgId = _tenant.OrganizationId!.Value;

    if (string.IsNullOrEmpty(dto.Name))
      return BadRequest("Name required");

    var group = new ChatGroup
    {
      Name = dto.Name.Trim(),
      Description = dto.Description,
      CreatedByUserId = myId,
      OrganizationId = orgId
    };

    _context.ChatGroups.Add(group);
    await _context.SaveChangesAsync();

    var memberIds = dto.MemberIds ?? new();
    if (!memberIds.Contains(myId))
      memberIds.Add(myId);

    foreach (var uid in memberIds)
    {
      _context.ChatGroupMembers.Add(
          new ChatGroupMember
          {
            GroupId = group.Id,
            UserId = uid
          });
    }

    await _context.SaveChangesAsync();

    return Ok(new
    {
      group.Id,
      group.Name,
      group.Description,
      group.CreatedAt,
      MemberCount = memberIds.Count
    });
  }

  [HttpGet("online")]
  public async Task<IActionResult>
      GetOnlineUsers()
  {
    var orgId = _tenant.OrganizationId!.Value;

    var users = await _context.Users
        .IgnoreQueryFilters()
        .AsNoTracking()
        .Where(u =>
            u.OrganizationId == orgId)
        .Select(u => u.Id)
        .ToListAsync();

    var online = await _context
        .UserOnlineStatuses
        .AsNoTracking()
        .Where(s =>
            users.Contains(s.UserId))
        .Select(s => new
        {
          s.UserId,
          s.IsOnline,
          s.LastSeen
        })
        .ToListAsync();

    return Ok(online);
  }

  [HttpGet("unread-count")]
  public async Task<IActionResult>
      GetUnreadCount()
  {
    var myId = GetUserId();
    if (myId == Guid.Empty)
      return Ok(new { count = 0 });

    var count = await _context.ChatMessages
        .AsNoTracking()
        .CountAsync(m =>
            m.ReceiverId == myId &&
            !m.IsRead);

    return Ok(new { count });
  }

  [HttpPost("send")]
  public async Task<IActionResult> Send(
      [FromBody] SendMessageDto dto)
  {
    var myId = GetUserId();
    var sender = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == myId);

    if (sender == null)
      return Unauthorized();

    var convoId =
        GuidCombine(myId, dto.ReceiverId);

    var msg = new ChatMessage
    {
      Content = dto.Content?.Trim() ?? "",
      SenderId = myId,
      ReceiverId = dto.ReceiverId,
      ConversationId = convoId,
      MessageType =
            dto.MessageType ?? "text",
      AttachmentUrl = dto.AttachmentUrl,
      AttachmentName = dto.AttachmentName,
      AttachmentType = dto.AttachmentType,
      OrganizationId =
            sender.OrganizationId
                ?? Guid.Empty
    };

    _context.ChatMessages.Add(msg);
    await _context.SaveChangesAsync();

    return Ok(new
    {
      msg.Id,
      msg.Content,
      msg.SenderId,
      msg.ReceiverId,
      msg.CreatedAt,
      msg.MessageType,
      msg.AttachmentUrl,
      msg.AttachmentName,
      IsFromMe = true,
      SenderName = sender.FullName
    });
  }
}
