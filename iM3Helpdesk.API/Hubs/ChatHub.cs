using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace iM3Helpdesk.API.Hubs;

[Authorize]
public class ChatHub : Hub
{
  private readonly ApplicationDbContext _context;

  private static readonly
      Dictionary<string, Guid> _connections
      = new();

  // ✅ NEW — tracks active call log IDs
  // key = "callerId_receiverId"
  // value = CallLog.Id
  private static readonly
      Dictionary<string, Guid> _activeCalls
      = new();

  public ChatHub(ApplicationDbContext context)
  {
    _context = context;
  }

  private Guid GetUserId()
  {
    var claim = Context.User?
        .FindFirst(ClaimTypes.NameIdentifier)
        ?.Value
        ?? Context.User?
            .FindFirst("sub")?.Value;
    Guid.TryParse(claim, out var id);
    return id;
  }

  public override async Task OnConnectedAsync()
  {
    var userId = GetUserId();
    if (userId == Guid.Empty)
    {
      await base.OnConnectedAsync();
      return;
    }

    _connections[Context.ConnectionId] = userId;

    await Groups.AddToGroupAsync(
        Context.ConnectionId,
        $"user-{userId}");

    var status = await _context
        .UserOnlineStatuses
        .FirstOrDefaultAsync(s =>
            s.UserId == userId);

    if (status == null)
    {
      _context.UserOnlineStatuses.Add(
          new UserOnlineStatus
          {
            UserId = userId,
            IsOnline = true,
            LastSeen = DateTime.UtcNow,
            ConnectionId = Context.ConnectionId
          });
    }
    else
    {
      status.IsOnline = true;
      status.LastSeen = DateTime.UtcNow;
      status.ConnectionId = Context.ConnectionId;
    }

    await _context.SaveChangesAsync();

    var user = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == userId);

    if (user?.OrganizationId != null)
    {
      await Groups.AddToGroupAsync(
          Context.ConnectionId,
          $"org-{user.OrganizationId}");

      await Clients
          .Group($"org-{user.OrganizationId}")
          .SendAsync("UserOnline", new
          {
            userId,
            isOnline = true
          });
    }

    var groupIds = await _context
        .ChatGroupMembers
        .Where(m => m.UserId == userId)
        .Select(m => m.GroupId)
        .ToListAsync();

    foreach (var gId in groupIds)
    {
      await Groups.AddToGroupAsync(
          Context.ConnectionId,
          $"group-{gId}");
    }

    await base.OnConnectedAsync();
  }

  public override async Task OnDisconnectedAsync(
      Exception? exception)
  {
    var userId = GetUserId();
    if (userId != Guid.Empty)
    {
      _connections.Remove(Context.ConnectionId);

      var status = await _context
          .UserOnlineStatuses
          .FirstOrDefaultAsync(s =>
              s.UserId == userId);

      if (status != null)
      {
        status.IsOnline = false;
        status.LastSeen = DateTime.UtcNow;
        await _context.SaveChangesAsync();
      }

      var user = await _context.Users
          .IgnoreQueryFilters()
          .FirstOrDefaultAsync(u =>
              u.Id == userId);

      if (user?.OrganizationId != null)
      {
        await Clients
            .Group($"org-{user.OrganizationId}")
            .SendAsync("UserOffline", new
            {
              userId,
              lastSeen = DateTime.UtcNow
            });
      }

      // ✅ Auto-close any open calls
      await AutoCloseCallsOnDisconnect(userId);
    }

    await base.OnDisconnectedAsync(exception);
  }

  // ── Messaging ─────────────────────────────

  public async Task SendMessage(
      string receiverIdStr,
      string content,
      string messageType = "text",
      string? attachmentUrl = null,
      string? attachmentName = null,
      string? attachmentType = null)
  {
    var senderId = GetUserId();
    if (senderId == Guid.Empty) return;
    if (!Guid.TryParse(
        receiverIdStr, out var receiverId))
      return;

    var sender = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == senderId);
    if (sender == null) return;

    var ids = new[] { senderId, receiverId }
        .OrderBy(x => x).ToArray();
    var convoId = GuidCombine(ids[0], ids[1]);

    var msg = new ChatMessage
    {
      Content = content?.Trim() ?? "",
      SenderId = senderId,
      ReceiverId = receiverId,
      ConversationId = convoId,
      MessageType = messageType,
      AttachmentUrl = attachmentUrl,
      AttachmentName = attachmentName,
      AttachmentType = attachmentType,
      OrganizationId =
          sender.OrganizationId ?? Guid.Empty
    };

    _context.ChatMessages.Add(msg);
    await _context.SaveChangesAsync();

    var dto = BuildMessageDto(msg, sender, false);

    await Clients
        .Group($"user-{receiverId}")
        .SendAsync("ReceiveMessage", dto);

    await Clients
        .Group($"user-{senderId}")
        .SendAsync("ReceiveMessage", dto);
  }

  public async Task SendGroupMessage(
      string groupIdStr,
      string content,
      string messageType = "text",
      string? attachmentUrl = null,
      string? attachmentName = null,
      string? attachmentType = null)
  {
    var senderId = GetUserId();
    if (senderId == Guid.Empty) return;
    if (!Guid.TryParse(
        groupIdStr, out var groupId))
      return;

    var isMember = await _context
        .ChatGroupMembers
        .AnyAsync(m =>
            m.GroupId == groupId &&
            m.UserId == senderId);
    if (!isMember) return;

    var sender = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == senderId);
    if (sender == null) return;

    var msg = new ChatMessage
    {
      Content = content?.Trim() ?? "",
      SenderId = senderId,
      GroupId = groupId,
      ConversationId = groupId,
      MessageType = messageType,
      AttachmentUrl = attachmentUrl,
      AttachmentName = attachmentName,
      AttachmentType = attachmentType,
      OrganizationId =
          sender.OrganizationId ?? Guid.Empty
    };

    _context.ChatMessages.Add(msg);
    await _context.SaveChangesAsync();

    var dto = BuildMessageDto(msg, sender, true);

    await Clients
        .Group($"group-{groupId}")
        .SendAsync("ReceiveMessage", dto);
  }

  public async Task MarkRead(string senderIdStr)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty) return;
    if (!Guid.TryParse(
        senderIdStr, out var senderId))
      return;

    var unread = await _context.ChatMessages
        .Where(m =>
            m.SenderId == senderId &&
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

    await Clients
        .Group($"user-{senderId}")
        .SendAsync("MessagesRead", new
        {
          byUserId = myId
        });
  }

  public async Task Typing(
      string receiverIdStr, bool isTyping)
  {
    var myId = GetUserId();
    if (!Guid.TryParse(
        receiverIdStr, out var receiverId))
      return;

    await Clients
        .Group($"user-{receiverId}")
        .SendAsync("UserTyping", new
        {
          userId = myId,
          isTyping
        });
  }

  // ── CALLS WITH LOGGING ────────────────────

  public async Task InitiateCall(
      string receiverIdStr,
      string callType,
      string offer)
  {
    var callerId = GetUserId();
    if (callerId == Guid.Empty) return;
    if (!Guid.TryParse(
        receiverIdStr, out var receiverId))
      return;

    var caller = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == callerId);
    if (caller == null) return;

    // ── Create call log (safe — won't break
    //    the call even if DB save fails) ──
    Guid logId = Guid.Empty;
    try
    {
      var log = new CallLog
      {
        CallerId = callerId,
        ReceiverId = receiverId,
        CallType = callType,
        Status = "ringing",
        // Only set OrgId if valid
        OrganizationId =
            caller.OrganizationId
            ?? Guid.Empty,
        StartedAt = DateTime.UtcNow
      };
      _context.CallLogs.Add(log);
      await _context.SaveChangesAsync();
      logId = log.Id;
      _activeCalls[
          CallKey(callerId, receiverId)]
          = log.Id;
    }
    catch (Exception ex)
    {
      // Log but don't crash the call
      Console.WriteLine(
          $"CallLog save failed: {ex.Message}");
    }

    await Clients
        .Group($"user-{receiverId}")
        .SendAsync("IncomingCall", new
        {
          callLogId = logId,
          callerId,
          callerName = caller.FullName,
          callerPhoto = caller.PhotoUrl,
          callType,
          offer
        });
  }

  public async Task AcceptCall(
      string callerIdStr, string answer)
  {
    var myId = GetUserId();
    if (!Guid.TryParse(
        callerIdStr, out var callerId))
      return;

    // ✅ Update log: ringing → answered
    await UpdateCallStatusAsync(
        callerId, myId, "answered");

    await Clients
        .Group($"user-{callerId}")
        .SendAsync("CallAccepted", new
        {
          byUserId = myId,
          answer
        });
  }

  public async Task RejectCall(
      string callerIdStr)
  {
    var myId = GetUserId();
    if (!Guid.TryParse(
        callerIdStr, out var callerId))
      return;

    // ✅ Receiver rejected → missed
    await FinaliseCallAsync(
        callerId, myId, "missed");

    await Clients
        .Group($"user-{callerId}")
        .SendAsync("CallRejected", new
        {
          byUserId = myId
        });
  }

  public async Task EndCall(
      string otherUserIdStr)
  {
    var myId = GetUserId();
    if (!Guid.TryParse(
        otherUserIdStr, out var otherUserId))
      return;

    // ✅ null = auto-detect final status
    await FinaliseCallAsync(
        myId, otherUserId, null);

    await Clients
        .Group($"user-{otherUserId}")
        .SendAsync("CallEnded", new
        {
          byUserId = myId
        });
  }

  public async Task SendIceCandidate(
      string targetIdStr, string candidate)
  {
    var myId = GetUserId();
    if (!Guid.TryParse(
        targetIdStr, out var targetId))
      return;

    await Clients
        .Group($"user-{targetId}")
        .SendAsync("IceCandidate", new
        {
          fromUserId = myId,
          candidate
        });
  }

  // ── Call log private helpers ──────────────

  private async Task UpdateCallStatusAsync(
      Guid callerId,
      Guid receiverId,
      string status)
  {
    try
    {
      var key = CallKey(callerId, receiverId);
      if (!_activeCalls.TryGetValue(key,
          out var logId)) return;

      var log = await _context.CallLogs
          .FirstOrDefaultAsync(l =>
              l.Id == logId);
      if (log == null) return;

      log.Status = status;
      await _context.SaveChangesAsync();
    }
    catch (Exception ex)
    {
      Console.WriteLine(
          $"UpdateCallStatus failed: " +
          $"{ex.Message}");
    }
  }

  private async Task FinaliseCallAsync(
      Guid callerId,
      Guid receiverId,
      string? status)
  {
    try
    {
      var key1 = CallKey(callerId, receiverId);
      var key2 = CallKey(receiverId, callerId);

      Guid logId = Guid.Empty;
      string? usedKey = null;

      if (_activeCalls.TryGetValue(
          key1, out var id1))
      { logId = id1; usedKey = key1; }
      else if (_activeCalls.TryGetValue(
          key2, out var id2))
      { logId = id2; usedKey = key2; }

      if (logId == Guid.Empty) return;
      if (usedKey != null)
        _activeCalls.Remove(usedKey);

      var log = await _context.CallLogs
          .FirstOrDefaultAsync(l =>
              l.Id == logId);
      if (log == null) return;

      var now = DateTime.UtcNow;

      log.Status = status ??
          (log.Status == "answered"
              ? "answered"
              : "cancelled");

      log.EndedAt = now;

      if (log.Status == "answered")
        log.DurationSeconds = (int)(
            now - log.StartedAt).TotalSeconds;

      await _context.SaveChangesAsync();
    }
    catch (Exception ex)
    {
      Console.WriteLine(
          $"FinaliseCall failed: " +
          $"{ex.Message}");
    }
  }

  private async Task AutoCloseCallsOnDisconnect(
      Guid userId)
  {
    var toClose = _activeCalls
        .Where(kv =>
        {
          var p = kv.Key.Split('_');
          return p.Length >= 2 &&
              ((Guid.TryParse(p[0], out var a)
                && a == userId) ||
               (Guid.TryParse(p[1], out var b)
                && b == userId));
        })
        .ToList();

    foreach (var kv in toClose)
    {
      var log = await _context.CallLogs
          .FirstOrDefaultAsync(l =>
              l.Id == kv.Value);

      if (log != null)
      {
        log.EndedAt = DateTime.UtcNow;
        log.Status =
            log.Status == "answered"
                ? "answered" : "missed";

        if (log.Status == "answered")
          log.DurationSeconds = (int)(
              log.EndedAt.Value -
              log.StartedAt).TotalSeconds;
      }

      _activeCalls.Remove(kv.Key);
    }

    if (toClose.Any())
      await _context.SaveChangesAsync();
  }

  private static string CallKey(
      Guid a, Guid b) => $"{a}_{b}";

  private static object BuildMessageDto(
      ChatMessage msg,
      User sender,
      bool isGroup)
  {
    return new
    {
      id = msg.Id,
      content = msg.Content,
      senderId = msg.SenderId,
      receiverId = msg.ReceiverId,
      groupId = msg.GroupId,
      conversationId = msg.ConversationId,
      createdAt = msg.CreatedAt,
      isRead = msg.IsRead,
      messageType = msg.MessageType,
      attachmentUrl = msg.AttachmentUrl,
      attachmentName = msg.AttachmentName,
      attachmentType = msg.AttachmentType,
      attachmentSize = msg.AttachmentSize,
      senderName = sender.FullName,
      senderPhoto = sender.PhotoUrl,
      isGroup
    };
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
}
