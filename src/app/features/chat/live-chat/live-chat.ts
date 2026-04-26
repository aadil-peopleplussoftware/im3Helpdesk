import { Component, Input, OnInit, OnDestroy,
  ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as signalR from '@microsoft/signalr';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-live-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-box">
      <div class="chat-header">
        <span class="online-dot" [class.online]="isConnected"></span>
        {{ isConnected ? 'Live Chat Active' : 'Connecting...' }}
      </div>
      <div class="chat-messages" #msgContainer>
        <div class="chat-msg" *ngFor="let m of messages"
          [class.own]="m.isOwn">
          <div class="msg-bubble">{{ m.message }}</div>
          <div class="msg-time">
            {{ m.timestamp | date:'hh:mm a' }}
          </div>
        </div>
      </div>
      <div class="chat-input-row">
        <input class="chat-input"
          [(ngModel)]="newMessage"
          placeholder="Type a message..."
          (keyup.enter)="sendMessage()"/>
        <button class="chat-send"
          (click)="sendMessage()">Send</button>
      </div>
    </div>
  `,
  styles: [`
    .chat-box { border: 1px solid #e8e8e8;
      border-radius: 10px; overflow: hidden; }
    .chat-header { padding: 10px 14px;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
      font-size: 13px; font-weight: 500;
      display: flex; align-items: center; gap: 8px; }
    .online-dot { width: 8px; height: 8px;
      border-radius: 50%; background: #9ca3af; }
    .online-dot.online { background: #22c55e; }
    .chat-messages { height: 200px; overflow-y: auto;
      padding: 12px; display: flex;
      flex-direction: column; gap: 8px; }
    .chat-msg { display: flex;
      flex-direction: column; }
    .chat-msg.own { align-items: flex-end; }
    .msg-bubble { padding: 8px 12px;
      border-radius: 10px; font-size: 13px;
      background: #f0f0f0; max-width: 80%; }
    .chat-msg.own .msg-bubble {
      background: #2563eb; color: white; }
    .msg-time { font-size: 10px; color: #9ca3af;
      margin-top: 2px; }
    .chat-input-row { display: flex; gap: 8px;
      padding: 10px; border-top: 1px solid #f0f0f0; }
    .chat-input { flex: 1; padding: 7px 10px;
      border: 1px solid #e0e0e0; border-radius: 8px;
      font-size: 13px; outline: none; }
    .chat-send { padding: 7px 14px;
      background: #2563eb; color: white;
      border: none; border-radius: 8px;
      cursor: pointer; font-size: 13px; }
  `]
})
export class LiveChatComponent
  implements OnInit, OnDestroy {
  @Input() ticketId = '';
  @Input() isAgent = false;

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  private hub!: signalR.HubConnection;
  messages: any[] = [];
  newMessage = '';
  isConnected = false;
  currentUserId = '';

  ngOnInit() {
    if (!this.ticketId) return;
    const token = this.authService.getToken();
    if (token) {
      const p = JSON.parse(atob(token.split('.')[1]));
      this.currentUserId = p.sub || '';
    }
    this.connectHub();
  }

  connectHub() {
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7071/hubs/chat', {
        accessTokenFactory: () =>
          this.authService.getToken() || ''
      })
      .withAutomaticReconnect()
      .build();

    this.hub.on('ReceiveMessage', (data) => {
      this.messages.push({
        ...data,
        isOwn: data.senderId === this.currentUserId
      });
      this.cdr.detectChanges();
    });

    this.hub.on('UserJoined', (data) => {
      this.messages.push({
        message: `User joined the chat`,
        timestamp: new Date(),
        isSystem: true
      });
      this.cdr.detectChanges();
    });

    this.hub.start()
      .then(() => {
        this.isConnected = true;
        this.cdr.detectChanges();
        if (this.ticketId)
          return this.hub.invoke(
            'JoinTicket', this.ticketId);
        return;
      })
      .catch(err => console.error(err));
  }

  sendMessage() {
    if (!this.newMessage.trim() ||
        !this.isConnected) return;

    this.hub.invoke(
      'SendMessage',
      this.ticketId,
      this.newMessage.trim()
    );
    this.newMessage = '';
  }

  ngOnDestroy() {
    if (this.hub)
      this.hub.stop();
  }
}