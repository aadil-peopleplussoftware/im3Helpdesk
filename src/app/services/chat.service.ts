// ✅ FILE: src/app/services/chat.service.ts
// FIXES:
// 1. unreadCount$ MarkRead ke baad properly reset hoti hai
// 2. MessagesRead event pe specific sender ki count clear hoti hai
// 3. Call notification streams global service ke through flow karti hain

import {
  Injectable, inject
} from '@angular/core';
import {
  HttpClient, HttpHeaders
} from '@angular/common/http';
import {
  BehaviorSubject, Observable
} from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ChatService {

  private http        = inject(HttpClient);
  private authService = inject(AuthService);

  readonly BASE = 'https://localhost:7071';
  private hub!: signalR.HubConnection;

  // ── Reactive streams ──────────────────
  newMessage$    = new BehaviorSubject<any>(null);
  typing$        = new BehaviorSubject<any>(null);
  userStatus$    = new BehaviorSubject<any>(null);
  unreadCount$   = new BehaviorSubject<number>(0);
  isConnected$   = new BehaviorSubject<boolean>(false);

  // ✅ Call streams
  incomingCall$  = new BehaviorSubject<any>(null);
  callAccepted$  = new BehaviorSubject<any>(null);
  callRejected$  = new BehaviorSubject<any>(null);
  callEnded$     = new BehaviorSubject<any>(null);
  iceCandidate$  = new BehaviorSubject<any>(null);

  // ✅ Call-back request from call log
  startCallRequest$ = new BehaviorSubject<{
    userId: string;
    type: 'audio' | 'video'
  } | null>(null);

  // ✅ Missed call count — layout badge ke liye
  missedCallCount$ = new BehaviorSubject<number>(0);

  // ✅ Ticket SignalR
  messages$      = new BehaviorSubject<any[]>([]);
  newTicket$     = new BehaviorSubject<any>(null);

  // ✅ MessagesRead stream — specific senderId
  // Chat page is subscribe karega taaki unread badge clear ho
  messagesRead$  = new BehaviorSubject<{
    readBy: string
  } | null>(null);

  // ── Connection state check ─────────────
  get isConnected(): boolean {
    return !!this.hub &&
      this.hub.state ===
        signalR.HubConnectionState.Connected;
  }

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  // ── Chat API ───────────────────────────
  getChatUsers(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE}/api/Chat/users`,
      { headers: this.getHeaders() });
  }

  getMessages(
    userId: string,
    page = 1
  ): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE}/api/Chat/messages/` +
      `${userId}?page=${page}&pageSize=50`,
      { headers: this.getHeaders() });
  }

  getGroups(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE}/api/Chat/groups`,
      { headers: this.getHeaders() });
  }

  getGroupMessages(
    groupId: string,
    page = 1
  ): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.BASE}/api/Chat/group/` +
      `${groupId}/messages?page=${page}`,
      { headers: this.getHeaders() });
  }

  createGroup(dto: {
    name: string;
    description?: string;
    memberIds: string[];
  }): Observable<any> {
    return this.http.post<any>(
      `${this.BASE}/api/Chat/groups`,
      dto,
      { headers: this.getHeaders() });
  }

  uploadFile(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    const h = new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
    return this.http.post<any>(
      `${this.BASE}/api/Chat/upload`,
      fd, { headers: h });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(
      `${this.BASE}/api/Chat/unread-count`,
      { headers: this.getHeaders() });
  }

  addGroupMembers(
    groupId: string,
    memberIds: string[]
  ): Observable<any> {
    return this.http.post<any>(
      `${this.BASE}/api/Chat/groups/` +
      `${groupId}/members`,
      { memberIds },
      { headers: this.getHeaders() });
  }

  loadUnreadCount() {
    this.getUnreadCount().subscribe({
      next: (d) =>
        this.unreadCount$.next(d.count || 0),
      error: () => {}
    });
  }

  clearMessages() {
    this.newMessage$.next(null);
    this.messages$.next([]);
  }

  // ── Call Log API ───────────────────────
  getCallLogs(
    filter: string = 'all',
    page = 1,
    size = 100
  ): Observable<any> {
    return this.http.get<any>(
      `${this.BASE}/api/CallLog` +
      `?filter=${filter}&page=${page}` +
      `&size=${size}`,
      { headers: this.getHeaders() });
  }

  getMissedCallCount(): Observable<any> {
    return this.http.get<any>(
      `${this.BASE}/api/CallLog/unread-missed`,
      { headers: this.getHeaders() });
  }

  markCallsRead(): Observable<any> {
    return new Observable(observer => {
      this.http.post<any>(
        `${this.BASE}/api/CallLog/mark-read`,
        {},
        { headers: this.getHeaders() }
      ).subscribe({
        next: (d) => {
          // ✅ Instantly badge 0 karo
          this.missedCallCount$.next(0);
          observer.next(d);
          observer.complete();
        },
        error: (e) => observer.error(e)
      });
    });
  }

  startCallFromLog(
    userId: string,
    type: 'audio' | 'video'
  ): void {
    this.startCallRequest$.next({ userId, type });
  }

  // ── Ticket room methods ──
  joinTicketRoom(ticketId: string): Promise<void> {
    if (!this.isConnected) return Promise.resolve();
    return this.hub.invoke('JoinTicketRoom', ticketId);
  }

  leaveTicketRoom(ticketId: string): Promise<void> {
    if (!this.isConnected) return Promise.resolve();
    return this.hub.invoke('LeaveTicketRoom', ticketId);
  }

  joinOrgRoom(orgId: string): Promise<void> {
    if (!this.isConnected) return Promise.resolve();
    return this.hub.invoke('JoinOrgRoom', orgId);
  }

  // ── SignalR ────────────────────────────
  connect() {
    if (this.isConnected) return;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(`${this.BASE}/hubs/chat`, {
        accessTokenFactory: () =>
          this.authService.getToken() || ''
      })
      .withAutomaticReconnect([
        0, 2000, 5000, 10000, 30000
      ])
      .build();

    // ── Chat messages ──
    this.hub.on('ReceiveMessage', (msg) => {
      this.newMessage$.next(msg);
      this.loadUnreadCount();

      const current = this.messages$.getValue();
      this.messages$.next([...current, msg]);
    });

    this.hub.on('NewTicket', (ticket) => {
      this.newTicket$.next(ticket);
    });

    this.hub.on('UserTyping', (d) => {
      this.typing$.next(d);
      setTimeout(() =>
        this.typing$.next(null), 3000);
    });

    this.hub.on('UserOnline', (d) =>
      this.userStatus$.next({ ...d, isOnline: true }));

    this.hub.on('UserOffline', (d) =>
      this.userStatus$.next({ ...d, isOnline: false }));

    // ✅ BUG FIX: MessagesRead — stream emit karo taaki
    // chat page us sender ka unreadCount = 0 kar sake
    // Pehle sirf loadUnreadCount() tha jo total count reload karta tha
    // Ab specific sender info bhi milti hai
    this.hub.on('MessagesRead', (d) => {
      this.messagesRead$.next({ readBy: d?.ReadBy || d?.readBy });
      this.loadUnreadCount();
    });

    // ✅ Call signals
    this.hub.on('IncomingCall',  (d) => this.incomingCall$.next(d));
    this.hub.on('CallAccepted',  (d) => this.callAccepted$.next(d));
    this.hub.on('CallRejected',  (d) => this.callRejected$.next(d));
    this.hub.on('CallEnded',     (d) => this.callEnded$.next(d));
    this.hub.on('IceCandidate',  (d) => this.iceCandidate$.next(d));

    this.hub.onreconnecting(() =>
      this.isConnected$.next(false));

    this.hub.onreconnected(() => {
      this.isConnected$.next(true);
      this.loadUnreadCount();
    });

    this.hub.onclose(() =>
      this.isConnected$.next(false));

    this.hub.start()
      .then(() => {
        this.isConnected$.next(true);
        this.loadUnreadCount();
      })
      .catch(e =>
        console.error('Chat hub error:', e));
  }

  disconnect() {
    this.hub?.stop();
  }

  // ── Safe hub invoke ────────────────────
  private safeInvoke(
    method: string,
    ...args: any[]
  ): Promise<void> {
    if (!this.isConnected)
      return Promise.resolve();
    return this.hub.invoke(method, ...args)
      .catch(e => {
        if (!e?.message?.includes(
            'not in the \'Connected\''))
          console.error(`Hub.${method} error:`, e);
      });
  }

  // ── Hub send methods ───────────────────
  sendMessage(
    receiverId: string,
    content: string,
    messageType = 'text',
    attachmentUrl?: string,
    attachmentName?: string,
    attachmentType?: string
  ): Promise<void> {
    return this.safeInvoke(
      'SendMessage', receiverId, content,
      messageType,
      attachmentUrl  ?? null,
      attachmentName ?? null,
      attachmentType ?? null);
  }

  sendGroupMessage(
    groupId: string,
    content: string,
    messageType = 'text',
    attachmentUrl?: string,
    attachmentName?: string,
    attachmentType?: string
  ): Promise<void> {
    return this.safeInvoke(
      'SendGroupMessage', groupId, content,
      messageType,
      attachmentUrl  ?? null,
      attachmentName ?? null,
      attachmentType ?? null);
  }

  sendTicketMessage(
    ticketId: string,
    message: string,
    senderName: string,
    isAgent: boolean
  ): Promise<void> {
    return this.safeInvoke(
      'SendMessage', ticketId, message,
      senderName, isAgent);
  }

  markRead(senderId: string): Promise<void> {
    return this.safeInvoke('MarkRead', senderId);
  }

  sendTyping(
    receiverId: string,
    isTyping: boolean
  ): Promise<void> {
    return this.safeInvoke(
      'Typing', receiverId, isTyping);
  }

  initiateCall(
    receiverId: string,
    callType: string,
    offer: string
  ): Promise<void> {
    return this.safeInvoke(
      'InitiateCall', receiverId, callType, offer);
  }

  acceptCall(
    callerId: string,
    answer: string
  ): Promise<void> {
    return this.safeInvoke(
      'AcceptCall', callerId, answer);
  }

  rejectCall(callerId: string): Promise<void> {
    return this.safeInvoke('RejectCall', callerId);
  }

  endCall(userId: string): Promise<void> {
    return this.safeInvoke('EndCall', userId);
  }

  sendIceCandidate(
    targetId: string,
    candidate: string
  ): Promise<void> {
    return this.safeInvoke(
      'SendIceCandidate', targetId, candidate);
  }
}