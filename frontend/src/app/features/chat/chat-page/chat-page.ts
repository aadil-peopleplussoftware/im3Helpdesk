// ✅ FILE: src/app/pages/chat/chat-page/chat-page.ts

import {
  Component, OnInit, OnDestroy, AfterViewChecked,
  ChangeDetectorRef, inject, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ChatService } from '../../../core/services/chat.service';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { CallLogComponent } from '../../call-logs/call-log.component';
import { GlobalCallNotificationService }
  from '../../../core/services/global-call-notification.service';
import { environment } from '../../../../environments/environment';

type FilterType = 'all' | 'unread' | 'online' | 'groups';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent, CallLogComponent],
  templateUrl: './chat-page.html',
  styleUrls: ['./chat-page.scss']
})
export class ChatPageComponent implements OnInit, OnDestroy, AfterViewChecked {

  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private http        = inject(HttpClient);
  public  router      = inject(Router);
  private route       = inject(ActivatedRoute);
  private cdr         = inject(ChangeDetectorRef);
  public  callSvc     = inject(GlobalCallNotificationService);
  readonly baseUrl = environment.baseUrl;

  @ViewChild('messagesContainer') msgContainer!: ElementRef;
  @ViewChild('localVideo')        localVideoRef!: ElementRef;
  @ViewChild('remoteVideo')       remoteVideoRef!: ElementRef;
  @ViewChild('remoteAudio')       remoteAudioRef!: ElementRef;

  // ── Chat state ────────────────────────────
  users:         any[] = [];
  groups:        any[] = [];
  filteredItems: any[] = [];
  selectedUser:  any   = null;
  selectedGroup: any   = null;
  messages:      any[] = [];
  newMessage           = '';
  searchQuery          = '';
  activeFilter: FilterType = 'all';
  loadingUsers         = true;
  loadingMessages      = false;
  isTyping             = false;
  typingTimeout: any;
  shouldScrollToBottom = false;
  uploadingFile        = false;
  myId   = '';
  myName = '';
  sidebarTab: 'chat' | 'calls' = 'chat';

  // ── Call UI state ─────────────────────────
  callState: 'idle' | 'calling' | 'receiving' | 'active' | 'minimized' = 'idle';
  callType: 'audio' | 'video' = 'audio';
  callDuration = 0;
  isMuted      = false;
  isCameraOff  = false;
  private callTimerUI: any;
  private pollTimer: any;

  // ── Group modals ──────────────────────────
  showCreateGroup    = false;
  newGroupName       = '';
  newGroupDesc       = '';
  selectedMemberIds: string[] = [];
  memberSearchQuery  = '';
  showAddMembers     = false;
  addMemberGroupId   = '';
  addMemberGroupName = '';
  addMemberSearch    = '';
  addMemberSelected: string[] = [];
  addMemberLoading   = false;

  get filteredModalUsers(): any[] {
    const q = this.memberSearchQuery.toLowerCase();
    if (!q) return this.users;
    return this.users.filter(u =>
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q));
  }

  get filteredAddMemberUsers(): any[] {
    const q = this.addMemberSearch.toLowerCase();
    const ex = this.selectedGroup?.members?.map((m: any) => m.userId) || [];
    let list = this.users.filter(u => !ex.includes(u.id));
    if (q) list = list.filter(u =>
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q));
    return list;
  }

  private subs: Subscription[] = [];

  // ─────────────────────────────────────────
  ngOnInit() {
    this.loadMyProfile();

    this.chatService.connect();
    this.loadUsers();
    this.loadGroups();
    this.subscribeToEvents();
    this.restoreCallState();
  }

  private loadMyProfile() {
    this.myName = this.authService.getUserName() || '';
    this.http.get<any>(`${environment.apiUrl}/Profile`).subscribe({
      next: (profile) => {
        this.myId = profile?.id || profile?.userId || '';
        if (!this.myName) {
          this.myName = profile?.fullName || '';
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ✅ Call state restore on page load/navigate
  private restoreCallState() {
    if (this.callSvc.isCallActive) {
      // Active call hai (minimize se wapas aaya)
      this.callState    = 'active';
      this.callType     = this.callSvc.callType;
      this.callDuration = this.callSvc.callDuration;
      this.startUITimer();
      this.attachStreams();
      this.cdr.detectChanges();

    } else if (this.callSvc.incomingCallData && !this.callSvc.isVisible) {
      // Global popup se accept kiya — answerCallInternal chal raha hai
      // callState = active, poll karo jab tak isCallActive=true
      this.callState = 'active';
      this.callType  = this.callSvc.callType;
      this.cdr.detectChanges();
      this.pollForActiveCall();

    } else if (this.callSvc.pc && !this.callSvc.isCallActive) {
      // Outgoing call chal rahi hai (calling state) — ringing
      this.callState = 'calling';
      this.callType  = this.callSvc.callType;
      this.cdr.detectChanges();
    }
    // ✅ incomingCall$ se popup trigger nahi karo yahan
    // Global popup already handle karta hai
  }

  private pollForActiveCall() {
    clearInterval(this.pollTimer);
    let attempts = 0;
    this.pollTimer = setInterval(() => {
      attempts++;
      if (this.callSvc.isCallActive) {
        clearInterval(this.pollTimer);
        this.callDuration = this.callSvc.callDuration;
        this.startUITimer();
        this.attachStreams();
        this.cdr.detectChanges();
      } else if (attempts > 35) {
        // 3.5s ke baad bhi active nahi
        clearInterval(this.pollTimer);
        this.callState = 'idle';
        this.cdr.detectChanges();
      }
    }, 100);
  }

  private attachStreams() {
    setTimeout(() => {
      // Remote audio/video
      const remote = this.callSvc.remoteStream;
      if (remote) {
        if (this.remoteVideoRef?.nativeElement)
          this.remoteVideoRef.nativeElement.srcObject = remote;
        if (this.remoteAudioRef?.nativeElement) {
          this.remoteAudioRef.nativeElement.srcObject = remote;
          this.remoteAudioRef.nativeElement.play().catch(() => {});
        }
      }
      // Local video
      if (this.callSvc.localStream &&
          this.localVideoRef?.nativeElement &&
          this.callType === 'video') {
        this.localVideoRef.nativeElement.srcObject = this.callSvc.localStream;
      }
    }, 200);
  }

  // ── Event subscriptions ──────────────────
  private subscribeToEvents() {

    // New message
    this.subs.push(
      this.chatService.newMessage$.subscribe(msg => {
        if (!msg) return;
        const forUser =
          this.selectedUser && !msg.groupId &&
          ((msg.senderId === this.myId && msg.receiverId === this.selectedUser.id) ||
           (msg.senderId === this.selectedUser.id && msg.receiverId === this.myId) ||
           (msg.isFromMe && msg.receiverId === this.selectedUser.id));
        const forGroup =
          this.selectedGroup && msg.groupId === this.selectedGroup.id;

        if (forUser || forGroup) {
          if (!this.messages.some(m => m.id === msg.id)) {
            this.messages = [...this.messages, msg];
            this.queueScrollToBottom();
          }
        }

        // Group sidebar bookkeeping: bump unread count for inactive
        // groups, refresh lastMessage, surface unknown groups.
        if (msg.groupId) {
          const idx = this.groups.findIndex(g => g.id === msg.groupId);
          if (idx === -1) {
            this.loadGroups();
          } else {
            const g = this.groups[idx];
            const isCurrent = this.selectedGroup?.id === msg.groupId;
            const inc = (!msg.isFromMe && !isCurrent) ? 1 : 0;
            const updated = {
              ...g,
              unreadCount: (g.unreadCount || 0) + inc,
              lastMessage: {
                content: msg.content,
                createdAt: msg.createdAt,
                isFromMe: !!msg.isFromMe
              }
            };
            this.groups = [
              ...this.groups.slice(0, idx),
              updated,
              ...this.groups.slice(idx + 1)
            ];
            this.applyFilter();
          }
        }

        this.cdr.detectChanges();
        this.loadUsers(true);
      })
    );

    // Group lifecycle (created / members added) → refresh sidebar list
    this.subs.push(
      this.chatService.groupChanged$.subscribe(g => {
        if (!g) return;
        this.loadGroups();
      })
    );

    // Typing
    this.subs.push(
      this.chatService.typing$.subscribe(d => {
        if (!d || d.userId !== this.selectedUser?.id) return;
        this.isTyping = d.isTyping;
        this.cdr.detectChanges();
      })
    );

    // Online status
    this.subs.push(
      this.chatService.userStatus$.subscribe(d => {
        if (!d) return;
        const u = this.users.find(u => u.id === d.userId);
        if (u) { u.isOnline = d.isOnline; if (!d.isOnline) u.lastSeen = d.lastSeen; this.applyFilter(); }
      })
    );

    // ✅ Incoming call — sirf receiving state (agar callSvc ne popup nahi dikhaya)
    // Global popup already handle karta hai, yahan sirf chat page ke liye
    this.subs.push(
      this.chatService.incomingCall$.subscribe(d => {
        if (!d) {
          // ✅ Clear — agar receiving tha toh idle karo
          if (this.callState === 'receiving') {
            this.callState = 'idle';
            this.cdr.detectChanges();
          }
          return;
        }
        // ✅ Sirf tab receiving dikhao jab:
        // - Hum chat page pe hain already
        // - callSvc.isVisible = false (matlab popup nahi aa raha, seedha yahan)
        // - call idle hai
        if (this.callState === 'idle' && !this.callSvc.isCallActive) {
          this.callState = 'receiving';
          this.callType  = d.callType || 'audio';
          this.cdr.detectChanges();
        }
      })
    );

    // ✅ Outgoing call accepted — UI active karo
    this.subs.push(
      this.chatService.callAccepted$.subscribe(d => {
        if (!d) return;
        // callSvc already handling WebRTC
        // Hum yahan sirf UI update karte hain
        setTimeout(() => {
          if (this.callSvc.isCallActive && this.callState === 'calling') {
            this.callState = 'active';
            this.callType  = this.callSvc.callType;
            this.callSvc.hidePopup();
            this.startUITimer();
            this.attachStreams();
            this.cdr.detectChanges();
          }
        }, 300);
      })
    );

    // Call rejected/ended
    this.subs.push(
      this.chatService.callRejected$.subscribe(d => {
        if (d) this.resetCallUI();
      })
    );
    this.subs.push(
      this.chatService.callEnded$.subscribe(d => {
        if (d) this.resetCallUI();
      })
    );

    // Remote stream arrived
    this.subs.push(
      this.callSvc.remoteStream$.subscribe(stream => {
        if (!stream) return;
        setTimeout(() => {
          if (this.remoteVideoRef?.nativeElement)
            this.remoteVideoRef.nativeElement.srcObject = stream;
          if (this.remoteAudioRef?.nativeElement) {
            this.remoteAudioRef.nativeElement.srcObject = stream;
            this.remoteAudioRef.nativeElement.play().catch(() => {});
          }
        }, 100);
        this.cdr.detectChanges();
      })
    );

    // Mini bar expand → maximize
    this.subs.push(
      this.callSvc.expandCallRequest$.subscribe(v => {
        if (!v) return;
        this.callState = 'active';
        this.callType  = this.callSvc.callType;
        this.callSvc.hideMiniBar();
        this.attachStreams();
        this.cdr.detectChanges();
      })
    );

    // Call-back from call log
    this.subs.push(
      this.chatService.startCallRequest$.subscribe(req => {
        if (!req) return;
        const user = this.users.find(u => u.id === req.userId);
        if (user) {
          this.selectUser(user);
          this.sidebarTab = 'chat';
          setTimeout(() => this.startCall(req.type), 400);
        }
        this.chatService.startCallRequest$.next(null);
      })
    );
  }

  // ── UI timer ────────────────────────────
  private startUITimer() {
    clearInterval(this.callTimerUI);
    this.callDuration = this.callSvc.callDuration;
    this.callTimerUI = setInterval(() => {
      this.callDuration = this.callSvc.callDuration;
      this.cdr.detectChanges();
    }, 1000);
  }

  private resetCallUI() {
    clearInterval(this.callTimerUI);
    clearInterval(this.pollTimer);
    this.callState    = 'idle';
    this.callDuration = 0;
    this.isMuted      = false;
    this.isCameraOff  = false;
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    if (this.callSvc.isCallActive && !this.callSvc.isMinimized) {
      const name = this.selectedUser?.fullName
        || this.callSvc.activeCall?.name
        || this.callSvc.incomingCallData?.callerName
        || 'Call';
      this.callSvc.showMiniBar(name, this.callSvc.callType || this.callType);
    }

    this.subs.forEach(s => s.unsubscribe());
    clearTimeout(this.typingTimeout);
    clearInterval(this.callTimerUI);
    clearInterval(this.pollTimer);
    this.chatService.clearCurrentlyViewing();
    // ✅ Call END mat karo — callSvc mein zinda hai
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // ── Sidebar ──────────────────────────────
  setSidebarTab(t: 'chat' | 'calls') {
    this.sidebarTab = t;
    if (t === 'calls') this.chatService.markCallsRead().subscribe();
  }

  // ── Call actions ─────────────────────────

  async startCall(type: 'audio' | 'video') {
    if (!this.selectedUser) return;
    if (this.callSvc.isCallActive) return;
    if (!this.chatService.isConnected) return;

    this.callType  = type;
    this.callState = 'calling';
    this.callSvc.callType          = type;
    this.callSvc.activeCallOtherId = this.selectedUser.id;
    this.cdr.detectChanges();

    await this.callSvc.startCallInternal(
      this.selectedUser.id, type, this.selectedUser.fullName || '');

    // Local video attach
    setTimeout(() => {
      if (this.callSvc.localStream &&
          this.localVideoRef?.nativeElement &&
          type === 'video') {
        this.localVideoRef.nativeElement.srcObject = this.callSvc.localStream;
      }
    }, 200);
  }

  async answerCall() {
    if (this.callState !== 'receiving') return;
    this.callState = 'active';
    this.callSvc.hidePopup();
    // ✅ incomingCall$ bhi clear karo
    this.chatService.incomingCall$.next(null);
    this.cdr.detectChanges();

    await this.callSvc.answerCallInternal();

    this.callType = this.callSvc.callType;
    this.startUITimer();
    this.attachStreams();
    this.cdr.detectChanges();
  }

  rejectCall() {
    this.callSvc.rejectIncomingCall();
    this.resetCallUI();
  }

  hangUp() {
    this.callSvc.endCall(true); // true = hub ko signal bhejo
    this.resetCallUI();
  }

  minimizeCall() {
    const name = this.selectedUser?.fullName
      || this.callSvc.incomingCallData?.callerName
      || 'Call';
    this.callSvc.showMiniBar(name, this.callType);
    this.callState = 'minimized';
    this.cdr.detectChanges();
  }

  maximizeCall() {
    this.callSvc.hideMiniBar();
    this.callState = 'active';
    this.callType  = this.callSvc.callType;
    this.attachStreams();
    this.cdr.detectChanges();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.callSvc.toggleMute(this.isMuted);
    this.cdr.detectChanges();
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    this.callSvc.toggleCamera(this.isCameraOff);
    this.cdr.detectChanges();
  }

  // ── Add-people picker (during active call) ───────────
  showInvitePicker = false;
  inviteUsers: any[] = [];
  inviteSearch = '';
  inviteSelected = new Set<string>();
  loadingInviteUsers = false;

  openInvitePicker() {
    this.showInvitePicker = true;
    this.inviteSearch = '';
    this.inviteSelected.clear();
    this.loadingInviteUsers = true;
    this.chatService.getChatUsers().subscribe({
      next: (data: any[]) => {
        this.inviteUsers = data || [];
        this.loadingInviteUsers = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingInviteUsers = false;
        this.cdr.detectChanges();
      }
    });
  }
  closeInvitePicker() {
    this.showInvitePicker = false;
    this.cdr.detectChanges();
  }
  toggleInviteUser(id: string) {
    if (this.inviteSelected.has(id)) this.inviteSelected.delete(id);
    else this.inviteSelected.add(id);
  }
  filteredInviteUsers(): any[] {
    const q = (this.inviteSearch || '').toLowerCase();
    const inCall = new Set<string>(
      Array.from(this.callSvc.participants.keys()));
    return this.inviteUsers.filter(u => {
      if (inCall.has(u.id)) return false;
      if (!q) return true;
      return (u.fullName || '').toLowerCase().includes(q)
          || (u.email || '').toLowerCase().includes(q);
    });
  }
  async confirmInvite() {
    const ids = Array.from(this.inviteSelected);
    if (!ids.length) return;
    await this.callSvc.inviteParticipants(ids);
    this.showInvitePicker = false;
    this.cdr.detectChanges();
  }

  getCallDurationStr(): string {
    const m = Math.floor(this.callDuration / 60);
    const s = this.callDuration % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  // ── Chat data ────────────────────────────
  loadUsers(silent = false) {
    if (!silent) this.loadingUsers = true;
    this.chatService.getChatUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.loadingUsers = false;
        if (this.selectedUser) {
          const u = data.find(u => u.id === this.selectedUser.id);
          if (u) {
            this.selectedUser.isOnline    = u.isOnline;
            this.selectedUser.lastSeen    = u.lastSeen;
            this.selectedUser.unreadCount = u.unreadCount;
          }
        }
        this.applyFilter();
        this.openFromQueryParams();
        this.cdr.detectChanges();
      },
      error: () => { this.loadingUsers = false; this.cdr.detectChanges(); }
    });
  }

  loadGroups() {
    this.chatService.getGroups().subscribe({
      next: (data) => {
        // Server now sends authoritative unreadCount; if user is
        // currently viewing a group, force-zero its count locally to
        // avoid a stale flicker before MarkGroupRead round-trips.
        const currentId = this.selectedGroup?.id;
        this.groups = (data || []).map((g: any) => ({
          ...g,
          unreadCount: g.id === currentId
            ? 0
            : (g.unreadCount || 0)
        }));
        if (this.activeFilter !== 'online') this.applyFilter();
        this.openFromQueryParams();
        this.cdr.detectChanges();
      }
    });
  }

  /** Open a chat thread from `?userId=` / `?groupId=` deep-link
   *  (used by the global chat toast 'open' click). */
  private openFromQueryParams(): void {
    const qp = this.route.snapshot.queryParamMap;
    const userId = qp.get('userId');
    const groupId = qp.get('groupId');
    if (groupId && this.groups?.length) {
      const g = this.groups.find(x => x.id === groupId);
      if (g && this.selectedGroup?.id !== g.id) this.selectGroup(g);
      return;
    }
    if (userId && this.users?.length) {
      const u = this.users.find(x => x.id === userId);
      if (u && this.selectedUser?.id !== u.id) this.selectUser(u);
    }
  }

  setFilter(f: FilterType) { this.activeFilter = f; this.applyFilter(); }

  applyFilter() {
    let items: any[];
    const groupItems = this.groups.map(
      g => ({ ...g, isGroupItem: true }));
    if (this.activeFilter === 'groups') {
      items = groupItems;
    } else if (this.activeFilter === 'unread') {
      const unreadUsers = this.users
        .filter(u => (u.unreadCount || 0) > 0);
      const unreadGroups = groupItems
        .filter(g => (g.unreadCount || 0) > 0);
      items = [...unreadUsers, ...unreadGroups];
    } else if (this.activeFilter === 'online') {
      items = this.users.filter(u => u.isOnline);
    } else {
      // All — merge DMs and groups so the sidebar matches Teams.
      items = [...this.users, ...groupItems];
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(i =>
        i.fullName?.toLowerCase().includes(q) ||
        i.name?.toLowerCase().includes(q) ||
        i.email?.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      const ua = a.unreadCount || 0, ub = b.unreadCount || 0;
      if (ua !== ub) return ub - ua;
      const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    this.filteredItems = items;
    this.cdr.detectChanges();
  }

  selectItem(item: any) {
    if (item.isGroupItem) this.selectGroup(item);
    else this.selectUser(item);
  }

  openUserProfile(user: any, ev?: Event) {
    ev?.stopPropagation();
    const id = String(user?.id || user?.userId || '').trim();
    if (!id) return;
    this.router.navigate(['/users', id]);
  }

  openMessageSenderProfile(message: any, ev?: Event) {
    ev?.stopPropagation();
    const id = String(message?.senderId || '').trim();
    if (!id || id === this.myId) return;
    this.router.navigate(['/users', id]);
  }

  selectUser(user: any) {
    this.selectedUser = user;
    this.selectedGroup = null;
    this.chatService.setCurrentlyViewing('dm', user?.id);
    this.messages = [];
    this.loadingMessages = true;
    this.cdr.detectChanges();
    this.chatService.getMessages(user.id).subscribe({
      next: (data) => {
        this.messages = data;
        this.loadingMessages = false;
        this.queueScrollToBottom();
        this.cdr.detectChanges();
        if ((user.unreadCount || 0) > 0) {
          user.unreadCount = 0;
          const u = this.users.find(u => u.id === user.id);
          if (u) u.unreadCount = 0;
          this.applyFilter();
          this.chatService.markRead(user.id);
        }
      }
    });
  }

  selectGroup(group: any) {
    this.selectedGroup = group;
    this.selectedUser = null;
    this.chatService.setCurrentlyViewing('group', group?.id);
    // Persist group read state on the server + clear local count.
    if (group) {
      const idx = this.groups.findIndex(g => g.id === group.id);
      if (idx !== -1 && (this.groups[idx].unreadCount || 0) > 0) {
        this.groups = [
          ...this.groups.slice(0, idx),
          { ...this.groups[idx], unreadCount: 0 },
          ...this.groups.slice(idx + 1)
        ];
        this.applyFilter();
      }
      this.chatService.markGroupRead(group.id).subscribe({
        error: () => { /* ignore — next reload will reconcile */ }
      });
    }
    this.messages = [];
    this.loadingMessages = true;
    this.cdr.detectChanges();
    this.chatService.getGroupMessages(group.id).subscribe({
      next: (data) => {
        this.messages = data;
        this.loadingMessages = false;
        this.queueScrollToBottom();
        this.cdr.detectChanges();
      }
    });
  }

  sendMessage() {
    const content = this.newMessage.trim();
    if (!content && !this.uploadingFile) return;
    if (!this.selectedUser && !this.selectedGroup) return;
    this.newMessage = '';
    this.queueScrollToBottom();

    if (this.selectedUser) {
      this.stopTyping();
      this.chatService.sendMessage(this.selectedUser.id, content);
    } else if (this.selectedGroup) {
      this.chatService.sendGroupMessage(this.selectedGroup.id, content);
    }
  }

  onFileSelect(event: any) {
    const files = Array.from(event.target.files) as File[];
    if (!files.length) return;
    files.forEach(f => this.sendFile(f));
    event.target.value = '';
  }

  sendFile(file: File) {
    this.uploadingFile = true;
    this.cdr.detectChanges();
    this.chatService.uploadFile(file).subscribe({
      next: (res) => {
        this.uploadingFile = false;
        const rid = this.selectedUser?.id, gid = this.selectedGroup?.id;
        if (rid) this.chatService.sendMessage(rid, this.newMessage || '', res.messageType, res.url, res.name, res.type);
        else if (gid) this.chatService.sendGroupMessage(gid, this.newMessage || '', res.messageType, res.url, res.name, res.type);
        this.newMessage = '';
        this.queueScrollToBottom();
        this.cdr.detectChanges();
      },
      error: () => { this.uploadingFile = false; this.cdr.detectChanges(); }
    });
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    } else { this.onTyping(); }
  }

  onTyping() {
    if (!this.selectedUser || !this.chatService.isConnected) return;
    this.chatService.sendTyping(this.selectedUser.id, true);
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.stopTyping(), 2000);
  }

  private stopTyping() {
    clearTimeout(this.typingTimeout);
    if (!this.selectedUser || !this.chatService.isConnected) return;
    this.chatService.sendTyping(this.selectedUser.id, false);
  }

  openCreateGroup() {
    this.showCreateGroup = true;
    this.newGroupName = ''; this.newGroupDesc = '';
    this.selectedMemberIds = []; this.memberSearchQuery = '';
  }

  toggleMember(userId: string) {
    const idx = this.selectedMemberIds.indexOf(userId);
    if (idx > -1) this.selectedMemberIds.splice(idx, 1);
    else this.selectedMemberIds.push(userId);
  }

  isMemberSelected(id: string) { return this.selectedMemberIds.includes(id); }

  createGroup() {
    if (!this.newGroupName.trim()) return;
    this.chatService.createGroup({
      name: this.newGroupName.trim(),
      description: this.newGroupDesc,
      memberIds: this.selectedMemberIds
    }).subscribe({ next: () => { this.showCreateGroup = false; this.loadGroups(); this.cdr.detectChanges(); } });
  }

  openAddMembers(group: any) {
    this.addMemberGroupId = group.id; this.addMemberGroupName = group.name;
    this.addMemberSelected = []; this.addMemberSearch = '';
    this.showAddMembers = true; this.cdr.detectChanges();
  }

  toggleAddMember(id: string) {
    const idx = this.addMemberSelected.indexOf(id);
    if (idx > -1) this.addMemberSelected.splice(idx, 1);
    else this.addMemberSelected.push(id);
  }

  isAddMemberSelected(id: string) { return this.addMemberSelected.includes(id); }

  confirmAddMembers() {
    if (!this.addMemberSelected.length) return;
    this.addMemberLoading = true;
    this.chatService.addGroupMembers(this.addMemberGroupId, this.addMemberSelected)
      .subscribe({
        next: () => {
          this.addMemberLoading = false; this.showAddMembers = false;
          this.loadGroups();
          if (this.selectedGroup?.id === this.addMemberGroupId) this.selectGroup(this.selectedGroup);
          this.cdr.detectChanges();
        },
        error: () => { this.addMemberLoading = false; this.cdr.detectChanges(); }
      });
  }

  // ── Helpers ──────────────────────────────
  private queueScrollToBottom() {
    this.shouldScrollToBottom = true;

    // Message bubbles/media can resize after initial render,
    // so perform a few delayed scroll attempts.
    setTimeout(() => this.scrollToBottom(), 0);
    setTimeout(() => this.scrollToBottom(), 120);
    setTimeout(() => this.scrollToBottom(), 350);
  }

  onMessageMediaLoaded() {
    this.queueScrollToBottom();
  }

  scrollToBottom() {
    try { const el = this.msgContainer?.nativeElement; if (el) el.scrollTop = el.scrollHeight; } catch {}
  }

  shouldShowDate(prev: string, curr: string) {
    if (!prev) return true;
    return new Date(prev).toDateString() !== new Date(curr).toDateString();
  }

  openImage(url: string) { window.open(url, '_blank'); }

  getAvatarColor(name: string): string {
    const c = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return c[(name?.charCodeAt(0) || 0) % c.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]||'').join('').toUpperCase().slice(0,2);
  }

  getLastSeenText(user: any): string {
    if (user?.isOnline) return 'Online';
    if (!user?.lastSeen) return 'Offline';
    const diff = Date.now() - new Date(user.lastSeen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(user.lastSeen).toLocaleDateString();
  }

  getTimeStr(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr), diff = Date.now() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  }

  getRoleLabel(role: string): string {
    const m: any = { CompanyAdmin:'Admin', Agent:'Agent', Customer:'Customer', SuperAdmin:'Super Admin' };
    return m[role] || role || '';
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }
}