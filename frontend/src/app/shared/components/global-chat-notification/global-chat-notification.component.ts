// FILE: src/app/shared/components/global-chat-notification/global-chat-notification.component.ts
// Microsoft Teams-style chat toast notifications, mounted globally in the
// main layout. Listens to GlobalChatNotificationService.toasts() signal.

import {
  Component, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  GlobalChatNotificationService, ChatToast
} from '../../../core/services/global-chat-notification.service';

@Component({
  selector: 'app-global-chat-notification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="gcn-stack" *ngIf="svc.toasts().length">
  <div *ngFor="let t of svc.toasts(); trackBy: trackId"
       class="gcn-toast"
       (mouseenter)="svc.pauseAutoDismiss(t.id)"
       (mouseleave)="svc.resumeAutoDismiss(t.id)">

    <button type="button" class="gcn-close"
            title="Dismiss"
            (click)="svc.dismiss(t.id); $event.stopPropagation()">×</button>

    <div class="gcn-head" (click)="svc.openThread(t)">
      <div class="gcn-app">
        <span class="gcn-app-icon">💬</span>
        <span class="gcn-app-name">iM3 Helpdesk Chat</span>
      </div>
    </div>

    <div class="gcn-body" (click)="svc.openThread(t)">
      <div class="gcn-avatar"
           [style.background]="avatarColor(t.senderName)"
           [class.has-photo]="!!t.senderPhoto">
        <img *ngIf="t.senderPhoto" [src]="t.senderPhoto" alt="" />
        <span *ngIf="!t.senderPhoto">{{ initials(t.senderName) }}</span>
        <span class="gcn-kind-badge" *ngIf="t.kind === 'group'">👥</span>
      </div>
      <div class="gcn-text">
        <div class="gcn-title">
          <strong>{{ t.senderName }}</strong>
          <span class="gcn-group-tag" *ngIf="t.kind === 'group' && t.groupName">
            in {{ t.groupName }}
          </span>
        </div>
        <div class="gcn-preview">{{ t.preview }}</div>
      </div>
    </div>

    <div class="gcn-reply">
      <input type="text"
             class="gcn-reply-input"
             placeholder="Send a quick reply"
             [(ngModel)]="drafts[t.id]"
             (focus)="svc.pauseAutoDismiss(t.id)"
             (keydown.enter)="send(t)"
             (keydown.escape)="svc.dismiss(t.id)" />
      <button type="button" class="gcn-send-btn"
              [disabled]="!(drafts[t.id] || '').trim()"
              (click)="send(t)">➤</button>
    </div>

  </div>
</div>
`,
  styles: [`
:host { position: fixed; inset: 0; pointer-events: none; z-index: 9999; }

.gcn-stack {
  position: fixed;
  top: 70px;
  right: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 340px;
  max-width: calc(100vw - 32px);
  pointer-events: none;
}

.gcn-toast {
  pointer-events: auto;
  background: var(--ui-color-bg-surface, #fff);
  color: var(--ui-color-text-primary, #1f2937);
  border: 1px solid var(--ui-color-border, #e5e7eb);
  border-radius: 12px;
  box-shadow: 0 12px 32px -8px rgba(15, 23, 42, .28),
              0 4px 12px rgba(15, 23, 42, .08);
  overflow: hidden;
  position: relative;
  animation: gcnSlideIn .26s cubic-bezier(.2,.9,.2,1.1);
}

@keyframes gcnSlideIn {
  from { opacity: 0; transform: translateY(-8px) translateX(12px); }
  to   { opacity: 1; transform: translateY(0) translateX(0); }
}

.gcn-close {
  position: absolute;
  top: 6px; right: 8px;
  width: 22px; height: 22px;
  border: none; background: transparent;
  font-size: 20px; line-height: 1;
  color: var(--ui-color-text-muted, #6b7280);
  cursor: pointer; border-radius: 6px;
  &:hover { background: var(--ui-color-bg-subtle, #f3f4f6); color: #111827; }
}

.gcn-head {
  display: flex; align-items: center;
  padding: 8px 12px 4px;
  cursor: pointer;
}
.gcn-app {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 600;
  color: #6366f1;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.gcn-app-icon { font-size: 14px; }

.gcn-body {
  display: flex; gap: 12px;
  padding: 4px 12px 12px;
  cursor: pointer;
}

.gcn-avatar {
  position: relative;
  flex: 0 0 auto;
  width: 40px; height: 40px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 14px;
  overflow: hidden;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.gcn-kind-badge {
  position: absolute;
  right: -4px; bottom: -4px;
  width: 18px; height: 18px;
  background: #fff;
  border: 1px solid var(--ui-color-border, #e5e7eb);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px;
}

.gcn-text { min-width: 0; flex: 1 1 auto; }
.gcn-title {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 13px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gcn-title strong { color: var(--ui-color-text-primary, #111827); }
.gcn-group-tag {
  font-size: 11.5px; color: var(--ui-color-text-muted, #6b7280); font-weight: 500;
}
.gcn-preview {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--ui-color-text-muted, #4b5563);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gcn-reply {
  display: flex; align-items: center; gap: 6px;
  border-top: 1px solid var(--ui-color-border, #e5e7eb);
  padding: 8px 10px 10px;
  background: var(--ui-color-bg-subtle, #f9fafb);
}
.gcn-reply-input {
  flex: 1 1 auto;
  border: 1px solid var(--ui-color-border, #e5e7eb);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12.5px;
  background: var(--ui-color-bg-surface, #fff);
  color: var(--ui-color-text-primary, #111827);
  outline: none;
  &:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
}
.gcn-send-btn {
  flex: 0 0 auto;
  width: 32px; height: 32px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: transform .12s ease, opacity .12s ease;
  &:disabled { opacity: .45; cursor: not-allowed; }
  &:not(:disabled):hover { transform: translateY(-1px); }
}
`]
})
export class GlobalChatNotificationComponent {
  readonly svc = inject(GlobalChatNotificationService);

  /** Per-toast draft text bound to the quick-reply input. */
  drafts: Record<string, string> = {};

  trackId = (_: number, t: ChatToast) => t.id;

  send(t: ChatToast): void {
    const text = (this.drafts[t.id] || '').trim();
    if (!text) return;
    this.drafts[t.id] = '';
    this.svc.quickReply(t, text);
  }

  initials(name: string): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }

  avatarColor(name: string): string {
    const palette = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
      '#f97316', '#eab308', '#22c55e', '#10b981',
      '#06b6d4', '#3b82f6'
    ];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
}
