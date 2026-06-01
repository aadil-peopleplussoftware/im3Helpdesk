// Microsoft Teams-style global chat toast notifications.
// Listens to ChatService.newMessage$ and surfaces a stack of
// dismissible toasts in the top-right corner whenever a chat message
// arrives — for direct messages, group chats, and ticket-room chats.
// Suppresses the toast when the user is already viewing that thread.

import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ChatService } from './chat.service';

export interface ChatToast {
  id: string;
  kind: 'dm' | 'group';
  /** Conversation key — userId for DM, groupId for group. */
  threadId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string | null;
  groupName?: string;
  preview: string;
  isAttachment: boolean;
  attachmentType?: string | null;
  receivedAt: number;
}

@Injectable({ providedIn: 'root' })
export class GlobalChatNotificationService implements OnDestroy {
  private chat = inject(ChatService);
  private router = inject(Router);

  /** Visible toast stack (newest first). Capped at MAX_VISIBLE. */
  readonly toasts = signal<ChatToast[]>([]);
  /** Total accumulated unread popups badge — informational only. */
  readonly recentCount = computed(() => this.toasts().length);

  private readonly MAX_VISIBLE = 4;
  /** Auto-dismiss after this many ms unless user hovers/replies. */
  private readonly AUTO_DISMISS_MS = 8000;

  private subs: Subscription[] = [];
  private timers = new Map<string, any>();
  private initialized = false;

  /** Wire up SignalR subscription. Safe to call multiple times. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.subs.push(
      this.chat.newMessage$.subscribe(msg => this.onIncomingMessage(msg))
    );
    this.subs.push(
      this.chat.currentlyViewing$.subscribe(view => {
        if (!view) return;
        // If the user opens the thread, clear any pending toast for it.
        this.toasts.update(list =>
          list.filter(t => !(t.kind === view.kind && t.threadId === view.id)));
      })
    );
  }

  private onIncomingMessage(msg: any): void {
    if (!msg) return;
    // Ignore own messages (hub stamps IsFromMe=false on receiver side).
    if (msg.isFromMe === true || msg.IsFromMe === true) return;
    const senderId = String(msg.senderId ?? msg.SenderId ?? '');
    if (!senderId) return;

    const isGroup = !!(msg.groupId ?? msg.GroupId);
    const groupId = String(msg.groupId ?? msg.GroupId ?? '');
    // For DMs the thread key from the recipient's POV is the sender.
    const threadId = isGroup ? groupId : senderId;
    const kind: 'dm' | 'group' = isGroup ? 'group' : 'dm';

    // Suppress if the user is currently viewing this thread.
    const view = this.chat.currentlyViewing$.value;
    if (view && view.kind === kind && view.id === threadId) return;

    const toast: ChatToast = {
      id: String(msg.id ?? msg.Id ?? `${Date.now()}-${Math.random()}`),
      kind,
      threadId,
      senderId,
      senderName: String(
        msg.senderName ?? msg.SenderName ?? 'New message'),
      senderPhoto: msg.senderPhoto ?? msg.SenderPhoto ?? null,
      groupName: msg.groupName ?? msg.GroupName ?? undefined,
      preview: this.buildPreview(msg),
      isAttachment: !!(msg.attachmentUrl ?? msg.AttachmentUrl),
      attachmentType: msg.attachmentType ?? msg.AttachmentType ?? null,
      receivedAt: Date.now(),
    };

    // Coalesce: if a toast for the same thread already exists, replace it.
    this.toasts.update(list => {
      const filtered = list.filter(
        t => !(t.kind === toast.kind && t.threadId === toast.threadId));
      return [toast, ...filtered].slice(0, this.MAX_VISIBLE);
    });

    this.armAutoDismiss(toast.id);
  }

  private buildPreview(msg: any): string {
    const content: string = String(msg.content ?? msg.Content ?? '').trim();
    if (content) {
      const stripped = content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped.length > 140 ? stripped.slice(0, 137) + '…' : stripped;
    }
    const name = msg.attachmentName ?? msg.AttachmentName;
    const type = msg.attachmentType ?? msg.AttachmentType;
    if (name) return `📎 ${name}`;
    if (type?.startsWith('image/')) return '🖼️ Sent a picture';
    if (type?.startsWith('audio/')) return '🎤 Voice message';
    if (type?.startsWith('video/')) return '🎬 Video message';
    return 'Sent an attachment';
  }

  private armAutoDismiss(id: string): void {
    const prev = this.timers.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => this.dismiss(id), this.AUTO_DISMISS_MS);
    this.timers.set(id, t);
  }

  pauseAutoDismiss(id: string): void {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }
  resumeAutoDismiss(id: string): void { this.armAutoDismiss(id); }

  dismiss(id: string): void {
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
    this.toasts.update(list => list.filter(x => x.id !== id));
  }

  dismissAll(): void {
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
    this.toasts.set([]);
  }

  /** Open the chat page focused on the toast's thread, then dismiss. */
  openThread(toast: ChatToast): void {
    const queryParams = toast.kind === 'group'
      ? { groupId: toast.threadId }
      : { userId: toast.threadId };
    this.router.navigate(['/chat'], { queryParams });
    this.dismiss(toast.id);
  }

  /** Send a quick reply directly from the toast. */
  async quickReply(toast: ChatToast, text: string): Promise<void> {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return;
    try {
      if (toast.kind === 'group') {
        await this.chat.sendGroupMessage(toast.threadId, trimmed);
      } else {
        await this.chat.sendMessage(toast.threadId, trimmed);
      }
    } finally {
      this.dismiss(toast.id);
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
    this.dismissAll();
  }
}
