using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace iM3Helpdesk.API.Hubs;

[Authorize]
public class ChatHub : Hub
{
  private readonly ApplicationDbContext _db;

  // Track active calls: callerId -> receiverId
  private static readonly ConcurrentDictionary<string, string>
      _activeCalls = new();

  public ChatHub(ApplicationDbContext db)
  {
    _db = db;
  }

  // ─────────────────────────────────────────────
  // Helper: get current userId from JWT claims
  // ─────────────────────────────────────────────
  private Guid GetUserId()
  {
    var claim =
        Context.User?.FindFirst(
            ClaimTypes.NameIdentifier)?.Value
        ?? Context.User?.FindFirst("sub")?.Value;
    Guid.TryParse(claim, out var id);
    return id;
  }

  // ─────────────────────────────────────────────
  // ✅ KEY FIX: Get OrganizationId from DB
  // SignalR hubs don't have HTTP headers so
  // ICurrentTenantService returns null.
  // We get it directly from the Users table.
  // ─────────────────────────────────────────────
  private async Task<Guid> GetOrgIdAsync(Guid userId)
  {
    var user = await _db.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.Id == userId)
        .Select(u => new { u.OrganizationId })
        .FirstOrDefaultAsync();
    return user?.OrganizationId ?? Guid.Empty;
  }

  // ─────────────────────────────────────────────
  // OnConnected: mark user online
  // ─────────────────────────────────────────────
  public override async Task OnConnectedAsync()
  {
    var userId = GetUserId();
    if (userId == Guid.Empty)
    {
      await base.OnConnectedAsync();
      return;
    }

    // Add to personal group for targeted messages
    await Groups.AddToGroupAsync(
        Context.ConnectionId,
        userId.ToString());

    // Mark online
    await SetOnlineStatus(userId, true);

    var orgId = await GetOrgIdAsync(userId);
    if (orgId != Guid.Empty)
    {
      // Notify org members this user is online
      await Clients
          .GroupExcept(orgId.ToString(),
              Context.ConnectionId)
          .SendAsync("UserOnline",
              new { UserId = userId });

      await Groups.AddToGroupAsync(
          Context.ConnectionId,
          orgId.ToString());
    }

    await base.OnConnectedAsync();
  }

  // ─────────────────────────────────────────────
  // OnDisconnected: mark user offline
  // ─────────────────────────────────────────────
  public override async Task OnDisconnectedAsync(
      Exception? exception)
  {
    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      await SetOnlineStatus(userId, false);

      var orgId = await GetOrgIdAsync(userId);
      if (orgId != Guid.Empty)
      {
        await Clients
            .Group(orgId.ToString())
            .SendAsync("UserOffline",
                new { UserId = userId });
      }

      // If user disconnects mid-call, end it
      if (_activeCalls.TryRemove(
              userId.ToString(), out var otherId))
      {
        await Clients
            .Group(otherId)
            .SendAsync("CallEnded",
                new { UserId = userId });
      }
    }

    await base.OnDisconnectedAsync(exception);
  }

  // ─────────────────────────────────────────────
  // SendMessage: direct message
  // ─────────────────────────────────────────────
  public async Task SendMessage(
      string receiverId,
      string content,
      string messageType = "text",
      string? attachmentUrl = null,
      string? attachmentName = null,
      string? attachmentType = null)
  {
    var senderId = GetUserId();
    if (senderId == Guid.Empty) return;

    var orgId = await GetOrgIdAsync(senderId);

    var convoId = GuidCombine(
        senderId,
        Guid.Parse(receiverId));

    var msg = new ChatMessage
    {
      Content = content?.Trim() ?? "",
      SenderId = senderId,
      ReceiverId = Guid.Parse(receiverId),
      ConversationId = convoId,
      MessageType = messageType,
      AttachmentUrl = attachmentUrl,
      AttachmentName = attachmentName,
      AttachmentType = attachmentType,
      OrganizationId = orgId
    };

    _db.ChatMessages.Add(msg);
    await _db.SaveChangesAsync();

    var senderUser = await _db.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.Id == senderId)
        .Select(u => new
        {
          u.FullName,
          u.PhotoUrl
        })
        .FirstOrDefaultAsync();

    var payload = new
    {
      msg.Id,
      msg.Content,
      msg.SenderId,
      msg.ReceiverId,
      msg.CreatedAt,
      msg.MessageType,
      msg.AttachmentUrl,
      msg.AttachmentName,
      msg.AttachmentType,
      IsFromMe = false,
      SenderName = senderUser?.FullName ?? "",
      SenderPhoto = senderUser?.PhotoUrl
    };

    // Send to receiver
    await Clients
        .Group(receiverId)
        .SendAsync("ReceiveMessage", payload);

    // Echo back to sender (other tabs)
    await Clients
        .GroupExcept(
            senderId.ToString(),
            Context.ConnectionId)
        .SendAsync("ReceiveMessage",
            payload with { IsFromMe = true });
  }

  // ─────────────────────────────────────────────
  // SendGroupMessage
  // ─────────────────────────────────────────────
  public async Task SendGroupMessage(
      string groupId,
      string content,
      string messageType = "text",
      string? attachmentUrl = null,
      string? attachmentName = null,
      string? attachmentType = null)
  {
    var senderId = GetUserId();
    if (senderId == Guid.Empty) return;

    var orgId = await GetOrgIdAsync(senderId);

    var msg = new ChatMessage
    {
      Content = content?.Trim() ?? "",
      SenderId = senderId,
      GroupId = Guid.Parse(groupId),
      ConversationId = Guid.Parse(groupId),
      MessageType = messageType,
      AttachmentUrl = attachmentUrl,
      AttachmentName = attachmentName,
      AttachmentType = attachmentType,
      OrganizationId = orgId
    };

    _db.ChatMessages.Add(msg);
    await _db.SaveChangesAsync();

    var senderUser = await _db.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.Id == senderId)
        .Select(u => new { u.FullName, u.PhotoUrl })
        .FirstOrDefaultAsync();

    var payload = new
    {
      msg.Id,
      msg.Content,
      msg.SenderId,
      msg.GroupId,
      msg.CreatedAt,
      msg.MessageType,
      msg.AttachmentUrl,
      msg.AttachmentName,
      IsFromMe = false,
      SenderName = senderUser?.FullName ?? "",
      SenderPhoto = senderUser?.PhotoUrl
    };

    await Clients
        .Group(groupId)
        .SendAsync("ReceiveMessage", payload);
  }

  // ─────────────────────────────────────────────
  // MarkRead — UPDATED VERSION
  // ─────────────────────────────────────────────
  public async Task MarkRead(string senderId)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty) return;

    var unread = await _db.ChatMessages
        .Where(m =>
            m.SenderId == Guid.Parse(senderId) &&
            m.ReceiverId == myId &&
            !m.IsRead)
        .ToListAsync();

    if (!unread.Any()) return;

    unread.ForEach(m =>
    {
      m.IsRead = true;
      m.ReadAt = DateTime.UtcNow;
    });

    await _db.SaveChangesAsync();

    // ✅ FIX: camelCase property taaki JS mein d.readBy kaam kare
    await Clients
        .Group(senderId)
        .SendAsync("MessagesRead",
            new
            {
              readBy = myId,      // camelCase ✅
              ReadBy = myId       // PascalCase bhi raho for safety ✅
            });
  }

  // ─────────────────────────────────────────────
  // Typing indicator
  // ─────────────────────────────────────────────
  public async Task Typing(
      string receiverId, bool isTyping)
  {
    var senderId = GetUserId();
    await Clients
        .Group(receiverId)
        .SendAsync("UserTyping", new
        {
          SenderId = senderId,
          isTyping
        });
  }

  // ═══════════════════════════════════════════════
  // ── CALL METHODS ─────────────────────────────
  // ═══════════════════════════════════════════════

  // ─────────────────────────────────────────────
  // InitiateCall
  // ─────────────────────────────────────────────
  public async Task InitiateCall(
      string receiverId,
      string callType,
      string offer)
  {
    var callerId = GetUserId();
    if (callerId == Guid.Empty) return;

    // ✅ Get orgId from DB — NOT from tenant service
    var orgId = await GetOrgIdAsync(callerId);

    var callerUser = await _db.Users
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(u => u.Id == callerId)
        .Select(u => new { u.FullName })
        .FirstOrDefaultAsync();

    // Save call log as "ringing"
    var callLog = new CallLog
    {
      CallerId = callerId,
      ReceiverId = Guid.Parse(receiverId),
      CallType = callType,
      Status = "ringing",
      OrganizationId = orgId,          // ✅ from DB
      StartedAt = DateTime.UtcNow
    };

    _db.CallLogs.Add(callLog);
    await _db.SaveChangesAsync();

    // Track active call
    _activeCalls[callerId.ToString()] = receiverId;

    // Send to receiver
    await Clients
        .Group(receiverId)
        .SendAsync("IncomingCall", new
        {
          CallLogId = callLog.Id,
          CallerId = callerId,
          CallerName = callerUser?.FullName ?? "",
          CallType = callType,
          Offer = offer
        });
  }

  // ─────────────────────────────────────────────
  // AcceptCall
  // ─────────────────────────────────────────────
  public async Task AcceptCall(
      string callerId, string answer)
  {
    var receiverId = GetUserId();
    if (receiverId == Guid.Empty) return;

    // Update call log status to "answered"
    var log = await _db.CallLogs
        .Where(c =>
            c.CallerId == Guid.Parse(callerId) &&
            c.ReceiverId == receiverId &&
            c.Status == "ringing")
        .OrderByDescending(c => c.StartedAt)
        .FirstOrDefaultAsync();

    if (log != null)
    {
      log.Status = "answered";
      await _db.SaveChangesAsync();
    }

    await Clients
        .Group(callerId)
        .SendAsync("CallAccepted", new
        {
          ReceiverId = receiverId,
          Answer = answer
        });
  }

  // ─────────────────────────────────────────────
  // RejectCall
  // ─────────────────────────────────────────────
  public async Task RejectCall(string callerId)
  {
    var receiverId = GetUserId();
    if (receiverId == Guid.Empty) return;

    // Update call log status to "missed"
    var log = await _db.CallLogs
        .Where(c =>
            c.CallerId == Guid.Parse(callerId) &&
            c.ReceiverId == receiverId &&
            c.Status == "ringing")
        .OrderByDescending(c => c.StartedAt)
        .FirstOrDefaultAsync();

    if (log != null)
    {
      log.Status = "missed";
      log.EndedAt = DateTime.UtcNow;
      await _db.SaveChangesAsync();
    }

    _activeCalls.TryRemove(callerId, out _);

    await Clients
        .Group(callerId)
        .SendAsync("CallRejected", new
        {
          ReceiverId = receiverId
        });
  }

  // ─────────────────────────────────────────────
  // EndCall
  // ─────────────────────────────────────────────
  public async Task EndCall(string otherUserId)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty) return;

    // Find and finalize call log
    var otherGuid = Guid.Parse(otherUserId);
    var log = await _db.CallLogs
        .Where(c =>
            (c.CallerId == myId &&
             c.ReceiverId == otherGuid) ||
            (c.CallerId == otherGuid &&
             c.ReceiverId == myId))
        .Where(c =>
            c.Status == "ringing" ||
            c.Status == "answered")
        .OrderByDescending(c => c.StartedAt)
        .FirstOrDefaultAsync();

    if (log != null)
    {
      // Only update if was answered
      if (log.Status == "answered")
      {
        log.EndedAt = DateTime.UtcNow;
        log.DurationSeconds = (int)(
            log.EndedAt.Value - log.StartedAt
        ).TotalSeconds;
      }
      else
      {
        // Caller hung up before answer = cancelled
        log.Status = "cancelled";
        log.EndedAt = DateTime.UtcNow;
      }

      await _db.SaveChangesAsync();
    }

    _activeCalls.TryRemove(myId.ToString(), out _);
    _activeCalls.TryRemove(otherUserId, out _);

    await Clients
        .Group(otherUserId)
        .SendAsync("CallEnded", new
        {
          UserId = myId
        });
  }

  // ─────────────────────────────────────────────
  // SendIceCandidate
  // ─────────────────────────────────────────────
  public async Task SendIceCandidate(
      string targetId, string candidate)
  {
    var fromId = GetUserId();
    await Clients
        .Group(targetId)
        .SendAsync("IceCandidate", new
        {
          FromId = fromId,
          Candidate = candidate
        });
  }

  // ─────────────────────────────────────────────
  // Ticket rooms (existing functionality)
  // ─────────────────────────────────────────────
  public async Task JoinTicketRoom(string ticketId)
  {
    await Groups.AddToGroupAsync(
        Context.ConnectionId,
        $"ticket-{ticketId}");
  }

  public async Task LeaveTicketRoom(string ticketId)
  {
    await Groups.RemoveFromGroupAsync(
        Context.ConnectionId,
        $"ticket-{ticketId}");
  }

  public async Task JoinOrgRoom(string orgId)
  {
    await Groups.AddToGroupAsync(
        Context.ConnectionId,
        orgId);
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  private async Task SetOnlineStatus(
      Guid userId, bool isOnline)
  {
    try
    {
      var status = await _db.UserOnlineStatuses
          .IgnoreQueryFilters()
          .FirstOrDefaultAsync(s =>
              s.UserId == userId);

      if (status == null)
      {
        _db.UserOnlineStatuses.Add(
            new UserOnlineStatus
            {
              UserId = userId,
              IsOnline = isOnline,
              LastSeen = DateTime.UtcNow
            });
      }
      else
      {
        status.IsOnline = isOnline;
        status.LastSeen = DateTime.UtcNow;
      }

      await _db.SaveChangesAsync();
    }
    catch { /* don't crash the hub */ }
  }

  private static Guid GuidCombine(Guid a, Guid b)
  {
    var ba = a.ToByteArray();
    var bb = b.ToByteArray();
    var cb = new byte[16];
    for (int i = 0; i < 16; i++)
      cb[i] = (byte)(ba[i] ^ bb[i]);
    return new Guid(cb);
  }
}
