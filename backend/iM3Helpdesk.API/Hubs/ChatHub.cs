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

  // Track conference call participants per CallLog (room).
  // Key: callLogId (Guid). Value: thread-safe set of userIds in room.
  private static readonly ConcurrentDictionary<
      Guid, HashSet<Guid>> _callRooms = new();

  /// <summary>
  /// Calls that are (or have been) conferences — tracks every user who was
  /// ever part of the call (current room members + invitees that haven't
  /// joined yet). Lets <c>SendCallMessage</c> persist chat into a group even
  /// before all invitees have hit JoinConference.
  /// </summary>
  private static readonly ConcurrentDictionary<
      Guid, HashSet<Guid>> _conferenceMembers = new();

  private static HashSet<Guid> GetOrAddConfMembers(Guid callLogId)
  {
    return _conferenceMembers.GetOrAdd(
        callLogId, _ => new HashSet<Guid>());
  }

  private static HashSet<Guid> GetOrAddRoom(Guid callLogId)
  {
    return _callRooms.GetOrAdd(
        callLogId, _ => new HashSet<Guid>());
  }

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

    // Pull group + members so every recipient gets the chat toast on their
    // personal user group (which they already join in OnConnectedAsync).
    var groupGuid = Guid.Parse(groupId);
    var group = await _db.ChatGroups
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(g => g.Id == groupGuid)
        .Select(g => new { g.Id, g.Name })
        .FirstOrDefaultAsync();

    var memberIds = await _db.ChatGroupMembers
        .AsNoTracking()
        .IgnoreQueryFilters()
        .Where(m => m.GroupId == groupGuid)
        .Select(m => m.UserId)
        .ToListAsync();

    var basePayload = new
    {
      msg.Id,
      msg.Content,
      msg.SenderId,
      msg.GroupId,
      GroupName = group?.Name,
      msg.CreatedAt,
      msg.MessageType,
      msg.AttachmentUrl,
      msg.AttachmentName,
      msg.AttachmentType,
      IsFromMe = false,
      SenderName = senderUser?.FullName ?? "",
      SenderPhoto = senderUser?.PhotoUrl
    };

    foreach (var uid in memberIds)
    {
      var payload = uid == senderId
          ? basePayload with { IsFromMe = true }
          : basePayload;
      await Clients.Group(uid.ToString())
          .SendAsync("ReceiveMessage", payload);
    }
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

    // Echo CallLogId back to caller so the client can use it as the
    // conference roomId when promoting the 1-to-1 call to a group call.
    await Clients.Caller.SendAsync(
        "CallInitiated", new
        {
          CallLogId = callLog.Id,
          ReceiverId = receiverId
        });

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

      // Seed the conference room with both parties so any later
      // "invite to call" works even before promotion to a true conference.
      var room = GetOrAddRoom(log.Id);
      lock (room)
      {
        room.Add(log.CallerId);
        room.Add(log.ReceiverId);
      }
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

    // If this 1-to-1 was never promoted to a conference, drop the
    // seeded room so we don't leak entries forever.
    if (log != null &&
        _callRooms.TryGetValue(log.Id, out var room))
    {
      lock (room)
      {
        if (room.Count <= 2) _callRooms.TryRemove(log.Id, out _);
      }
    }

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

  // ═════════════════════════════════════════════
  // CONFERENCE / GROUP CALL SIGNALING (mesh)
  // Each participant maintains a peer connection to every other
  // participant. The hub only relays SDP offers/answers/ICE candidates
  // and notifies join/leave events; no media flows through the server.
  // ═════════════════════════════════════════════

  /// <summary>
  /// Invite one or more users to join an active call. The current user
  /// must already be a participant of the room (callLogId).
  /// </summary>
  public async Task InviteToConference(
      string callLogId, string[] inviteeIds)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty) return;
    if (!Guid.TryParse(callLogId, out var roomId)) return;

    var room = GetOrAddRoom(roomId);
    bool isMember;
    lock (room) { isMember = room.Contains(myId); }
    if (!isMember) return;

    var log = await _db.CallLogs
        .AsNoTracking()
        .FirstOrDefaultAsync(c => c.Id == roomId);
    if (log == null) return;

    var me = await _db.Users
        .AsNoTracking().IgnoreQueryFilters()
        .Where(u => u.Id == myId)
        .Select(u => new { u.FullName, u.PhotoUrl })
        .FirstOrDefaultAsync();

    Guid[] currentParticipants;
    lock (room) { currentParticipants = room.ToArray(); }

    var participantInfos = await _db.Users
        .AsNoTracking().IgnoreQueryFilters()
        .Where(u => currentParticipants.Contains(u.Id))
        .Select(u => new
        {
          UserId = u.Id,
          u.FullName,
          u.PhotoUrl
        })
        .ToListAsync();

    foreach (var idStr in inviteeIds)
    {
      if (!Guid.TryParse(idStr, out var invId)) continue;
      bool already;
      lock (room) { already = room.Contains(invId); }
      if (already) continue;

      // Mark this call as a conference and remember the invitee, even if
      // they haven't accepted yet, so chat persistence treats it as a group.
      var conf = GetOrAddConfMembers(roomId);
      lock (conf)
      {
        foreach (var rid in currentParticipants) conf.Add(rid);
        conf.Add(invId);
      }

      await Clients.Group(invId.ToString())
          .SendAsync("ConferenceInvite", new
          {
            CallLogId = roomId,
            FromUserId = myId,
            FromName = me?.FullName ?? "",
            CallType = log.CallType,
            Participants = participantInfos
          });
    }
  }

  /// <summary>
  /// Join the conference room. Returns the existing participants so the
  /// joiner can dial each of them with an SDP offer (mesh topology).
  /// </summary>
  public async Task<object> JoinConference(string callLogId)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty || !Guid.TryParse(callLogId, out var roomId))
      return new { Participants = Array.Empty<object>() };

    var room = GetOrAddRoom(roomId);
    Guid[] existing;
    lock (room)
    {
      existing = room.Where(u => u != myId).ToArray();
      room.Add(myId);
    }

    // Track me as a known conference member so any chat in this call
    // is persisted to the right ChatGroup, even if I leave/rejoin.
    var conf = GetOrAddConfMembers(roomId);
    lock (conf)
    {
      foreach (var uid in existing) conf.Add(uid);
      conf.Add(myId);
    }

    // If the group has already been auto-created from chat, add me as
    // a member so I see the group + history in the chat sidebar.
    var preexisting = await _db.ChatGroups
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(g => g.CallLogId == roomId);
    if (preexisting != null)
    {
      var alreadyMember = await _db.ChatGroupMembers
          .IgnoreQueryFilters()
          .AnyAsync(m =>
              m.GroupId == preexisting.Id && m.UserId == myId);
      if (!alreadyMember)
      {
        _db.ChatGroupMembers.Add(new ChatGroupMember
        {
          GroupId = preexisting.Id,
          UserId = myId
        });
        await _db.SaveChangesAsync();
        await Clients.Group(myId.ToString())
            .SendAsync("GroupCreated", new
            {
              preexisting.Id,
              preexisting.Name,
              preexisting.Description,
              preexisting.CreatedAt,
              MemberCount = 0,
              CreatedByUserId = preexisting.CreatedByUserId,
              CreatedByName = ""
            });
      }
    }

    var me = await _db.Users
        .AsNoTracking().IgnoreQueryFilters()
        .Where(u => u.Id == myId)
        .Select(u => new { u.FullName, u.PhotoUrl })
        .FirstOrDefaultAsync();

    // Tell existing members that I joined so their UI can show me
    // and prepare to receive my offer.
    foreach (var uid in existing)
    {
      await Clients.Group(uid.ToString())
          .SendAsync("ConferenceParticipantJoined", new
          {
            CallLogId = roomId,
            UserId = myId,
            FullName = me?.FullName ?? "",
            PhotoUrl = me?.PhotoUrl
          });
    }

    var details = await _db.Users
        .AsNoTracking().IgnoreQueryFilters()
        .Where(u => existing.Contains(u.Id))
        .Select(u => new
        {
          UserId = u.Id,
          u.FullName,
          u.PhotoUrl
        })
        .ToListAsync();

    return new { Participants = details };
  }

  /// <summary>Leave the conference room.</summary>
  public async Task LeaveConference(string callLogId)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty || !Guid.TryParse(callLogId, out var roomId))
      return;

    if (!_callRooms.TryGetValue(roomId, out var room)) return;

    Guid[] remaining;
    lock (room)
    {
      room.Remove(myId);
      remaining = room.ToArray();
    }

    if (remaining.Length == 0)
    {
      _callRooms.TryRemove(roomId, out _);
      return;
    }

    foreach (var uid in remaining)
    {
      await Clients.Group(uid.ToString())
          .SendAsync("ConferenceParticipantLeft", new
          {
            CallLogId = roomId,
            UserId = myId
          });
    }
  }

  /// <summary>Reject a conference invite (does not affect other peers).</summary>
  public async Task RejectConference(string callLogId)
  {
    var myId = GetUserId();
    if (myId == Guid.Empty || !Guid.TryParse(callLogId, out var roomId))
      return;

    if (!_callRooms.TryGetValue(roomId, out var room)) return;
    Guid[] members;
    lock (room) { members = room.ToArray(); }

    foreach (var uid in members)
    {
      await Clients.Group(uid.ToString())
          .SendAsync("ConferenceInviteRejected", new
          {
            CallLogId = roomId,
            UserId = myId
          });
    }
  }

  // ── Mesh signaling relays ──────────────────────────

  public async Task RelayConferenceOffer(
      string callLogId, string targetUserId, string offer)
  {
    var fromId = GetUserId();
    if (fromId == Guid.Empty) return;
    await Clients.Group(targetUserId)
        .SendAsync("ConferenceOffer", new
        {
          CallLogId = callLogId,
          FromUserId = fromId,
          Offer = offer
        });
  }

  public async Task RelayConferenceAnswer(
      string callLogId, string targetUserId, string answer)
  {
    var fromId = GetUserId();
    if (fromId == Guid.Empty) return;
    await Clients.Group(targetUserId)
        .SendAsync("ConferenceAnswer", new
        {
          CallLogId = callLogId,
          FromUserId = fromId,
          Answer = answer
        });
  }

  public async Task RelayConferenceIce(
      string callLogId, string targetUserId, string candidate)
  {
    var fromId = GetUserId();
    if (fromId == Guid.Empty) return;
    await Clients.Group(targetUserId)
        .SendAsync("ConferenceIce", new
        {
          CallLogId = callLogId,
          FromUserId = fromId,
          Candidate = candidate
        });
  }

  // ─────────────────────────────────────────────
  // In-call chat — persists per call:
  //   • 1-to-1 call → saved as direct ChatMessage
  //   • Conference (3+) → auto-create a ChatGroup tied to the
  //     CallLogId on first message; subsequent messages persist
  //     under that group so the chat survives after the call ends.
  // ─────────────────────────────────────────────
  public async Task SendCallMessage(string callLogId, string text)
  {
    var fromId = GetUserId();
    if (fromId == Guid.Empty) return;
    if (string.IsNullOrWhiteSpace(text)) return;
    if (!Guid.TryParse(callLogId, out var cid)) return;
    if (!_callRooms.TryGetValue(cid, out var room)) return;

    Guid[] roomMembers;
    lock (room) roomMembers = room.ToArray();
    if (roomMembers.Length < 2) return;

    // An active call is treated as a conference if EITHER the room
    // currently has 3+ live members OR it was ever flagged as a
    // conference (an invite was sent / a 3rd party joined). This makes
    // chat persistence robust against invitees who haven't joined yet.
    Guid[] confMembers = Array.Empty<Guid>();
    if (_conferenceMembers.TryGetValue(cid, out var conf))
    {
      lock (conf) confMembers = conf.ToArray();
    }

    var orgId = await GetOrgIdAsync(fromId);

    var me = await _db.Users.AsNoTracking().IgnoreQueryFilters()
        .Where(u => u.Id == fromId)
        .Select(u => new { u.FullName, u.PhotoUrl })
        .FirstOrDefaultAsync();

    // Look up an already-existing call group (any prior message in
    // this call may have created one).
    var existingGroup = await _db.ChatGroups
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(g => g.CallLogId == cid);

    bool isConference =
        existingGroup != null
        || confMembers.Length >= 3
        || roomMembers.Length >= 3;

    Guid? groupId = null;
    Guid? receiverId = null;
    object? newGroupNotice = null;
    Guid[] broadcastTargets = roomMembers;

    if (isConference)
    {
      // Union of every known participant (live + invited + group members
      // already in the DB) so the persisted group reflects the whole call.
      var unionIds = new HashSet<Guid>(roomMembers);
      foreach (var u in confMembers) unionIds.Add(u);
      if (existingGroup != null)
      {
        var dbMembers = await _db.ChatGroupMembers
            .IgnoreQueryFilters()
            .Where(m => m.GroupId == existingGroup.Id)
            .Select(m => m.UserId)
            .ToListAsync();
        foreach (var u in dbMembers) unionIds.Add(u);
      }
      var allIds = unionIds.ToArray();

      if (existingGroup == null)
      {
        var users = await _db.Users.AsNoTracking().IgnoreQueryFilters()
            .Where(u => allIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName })
            .ToListAsync();

        // Group name = creator first, then up to 2 others (Teams-style).
        var orderedNames = users
            .OrderBy(u => u.Id == fromId ? 0 : 1)
            .Select(u => u.FullName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .ToList();
        var displayName = string.Join(", ", orderedNames.Take(3));
        if (orderedNames.Count > 3)
          displayName += $" +{orderedNames.Count - 3}";
        if (string.IsNullOrWhiteSpace(displayName))
          displayName = "Group Call";

        var group = new ChatGroup
        {
          Name = displayName,
          Description = "Auto-created from group call",
          CreatedByUserId = fromId,
          OrganizationId = orgId,
          CallLogId = cid
        };
        _db.ChatGroups.Add(group);
        foreach (var uid in allIds)
        {
          _db.ChatGroupMembers.Add(new ChatGroupMember
          {
            GroupId = group.Id,
            UserId = uid
          });
        }
        await _db.SaveChangesAsync();
        existingGroup = group;

        newGroupNotice = new
        {
          group.Id,
          group.Name,
          group.Description,
          group.CreatedAt,
          MemberCount = allIds.Length,
          CreatedByUserId = fromId,
          CreatedByName = me?.FullName ?? ""
        };
      }
      groupId = existingGroup.Id;
      broadcastTargets = allIds;
    }
    else
    {
      // 1-to-1: receiver is the other party in the room.
      receiverId = roomMembers.FirstOrDefault(u => u != fromId);
      if (receiverId == Guid.Empty) return;
    }

    var msg = new ChatMessage
    {
      Content = text.Trim(),
      SenderId = fromId,
      ReceiverId = receiverId,
      GroupId = groupId,
      ConversationId = groupId
        ?? CombineUserIds(fromId, receiverId!.Value),
      MessageType = "text",
      OrganizationId = orgId
    };
    _db.ChatMessages.Add(msg);
    await _db.SaveChangesAsync();

    // Notify members of the new auto-created group BEFORE the message
    // so their chat sidebar can render the new group entry first.
    if (newGroupNotice != null)
    {
      foreach (var uid in broadcastTargets)
      {
        await Clients.Group(uid.ToString())
            .SendAsync("GroupCreated", newGroupNotice);
      }
    }

    // 1) In-call ephemeral toast (used by the floating call window).
    var callPayload = new
    {
      CallLogId = callLogId,
      FromUserId = fromId,
      FromName = me?.FullName ?? "",
      PhotoUrl = me?.PhotoUrl,
      Text = msg.Content,
      At = msg.CreatedAt
    };
    foreach (var uid in roomMembers)
    {
      if (uid == fromId) continue;
      await Clients.Group(uid.ToString())
          .SendAsync("CallMessage", callPayload);
    }

    // 2) Persistent ChatMessage broadcast so the regular chat page
    //    also receives it live and reflects history afterwards.
    var basePayload = new
    {
      msg.Id,
      msg.Content,
      msg.SenderId,
      msg.ReceiverId,
      msg.GroupId,
      msg.ConversationId,
      msg.CreatedAt,
      msg.MessageType,
      IsFromMe = false,
      SenderName = me?.FullName ?? "",
      SenderPhoto = me?.PhotoUrl
    };
    foreach (var uid in broadcastTargets)
    {
      var payload = uid == fromId
          ? basePayload with { IsFromMe = true }
          : basePayload;
      await Clients.Group(uid.ToString())
          .SendAsync("ReceiveMessage", payload);
    }
  }

  /// <summary>Stable conversation id for a 1-to-1 pair (XOR of both ids).</summary>
  private static Guid CombineUserIds(Guid a, Guid b)
  {
    var ab = a.ToByteArray();
    var bb = b.ToByteArray();
    var r = new byte[16];
    for (int i = 0; i < 16; i++) r[i] = (byte)(ab[i] ^ bb[i]);
    return new Guid(r);
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
