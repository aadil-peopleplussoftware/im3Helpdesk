import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatService }
  from '../../core/services/chat.service';

type LogFilter =
  'all' | 'missed' | 'incoming' | 'outgoing';

@Component({
  selector: 'app-call-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="call-log-panel">

  <!-- Header -->
  <div class="cl-header">
    <div class="cl-title-row">
      <h2 class="cl-title">History</h2>
      <span class="cl-missed-badge"
        *ngIf="missedCount > 0">
        {{ missedCount }}
      </span>
    </div>

    <!-- Filter tabs -->
    <div class="cl-filter-bar">
      <button
        *ngFor="let f of filters"
        type="button"
        class="cl-filter-btn"
        [class.active]="activeFilter === f.key"
        (click)="setFilter(f.key)">
        {{ f.label }}
        <span class="cl-f-dot"
          *ngIf="f.key === 'missed' &&
            missedCount > 0">
        </span>
      </button>
      <button class="cl-sort-btn"
        type="button" title="Sort">&#8801;</button>
    </div>
  </div>

  <!-- Loading -->
  <div class="cl-loading" *ngIf="loading">
    <div class="cl-spin"></div>
    <span>Loading call history...</span>
  </div>

  <!-- Empty -->
  <div class="cl-empty"
    *ngIf="!loading && !logs.length">
    <div class="cl-empty-icon">&#128565;</div>
    <p>No {{ activeFilter === 'all'
      ? '' : activeFilter }} calls yet</p>
  </div>

  <!-- Call list -->
  <div class="cl-list"
    *ngIf="!loading && logs.length">

    <div
      *ngFor="let log of logs"
      class="cl-item"
      [class.hovered]="hoveredId === log.id"
      (mouseenter)="hoveredId = log.id"
      (mouseleave)="hoveredId = null">

      <!-- Avatar -->
      <div class="cl-av-wrap">
        <div class="cl-av"
          [style.background]="
            getAvatarColor(log.otherUserName)">
          <img
            *ngIf="log.otherUserPhoto"
            [src]="log.otherUserPhoto"
            [alt]="log.otherUserName" />
          <span *ngIf="!log.otherUserPhoto">
            {{ getInitials(log.otherUserName) }}
          </span>
        </div>
        <span class="cl-type-badge"
          [title]="log.callType">
          {{ getCallTypeIcon(log) }}
        </span>
      </div>

      <!-- Info -->
      <div class="cl-info">
        <div class="cl-name">
          {{ log.otherUserName || 'Unknown' }}
        </div>
        <div class="cl-status"
          [ngClass]="getStatusClass(log)">
          <span class="cl-status-icon">
            {{ getStatusIcon(log) }}
          </span>
          {{ getStatusLabel(log) }}
          <span
            *ngIf="getDurationStr(log.durationSeconds)"
            class="cl-duration">
            &middot; {{ getDurationStr(log.durationSeconds) }}
          </span>
        </div>
      </div>

      <!-- Right: time / actions -->
      <div class="cl-right">
        <span class="cl-time"
          *ngIf="hoveredId !== log.id">
          {{ getTimeLabel(log.startedAt) }}
        </span>
        <div class="cl-actions"
          *ngIf="hoveredId === log.id">
          <button
            type="button"
            class="cl-act-btn"
            title="More">&#183;&#183;&#183;</button>
          <button
            type="button"
            class="cl-call-btn"
            title="Call back"
            (click)="callBack(log, 'audio')">
            &#128222; Call
          </button>
        </div>
      </div>

    </div>
  </div>
</div>
  `,
  styles: [`
    :host {
      --accent: var(--ui-color-primary);
      --accent-hover: var(--ui-color-primary-hover);
      --missed: var(--ui-color-danger);
      --border: var(--ui-color-border);
      --white: var(--ui-color-bg-surface);
      --bg: var(--ui-color-bg-page);
      --subtle: var(--ui-color-bg-subtle);
      --hover: var(--ui-color-bg-hover);
      --text: var(--ui-color-text-primary);
      --sub: var(--ui-color-text-secondary);
      --muted: var(--ui-color-text-muted);
    }
    .call-log-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--white);
      overflow: hidden;
    }
    .cl-header {
      padding: 16px 16px 0;
      border-bottom: 1px solid var(--border);
      background: var(--white);
      flex-shrink: 0;
    }
    .cl-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .cl-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin: 0;
      flex: 1;
    }
    .cl-missed-badge {
      background: var(--missed);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
    }
    .cl-filter-bar {
      display: flex;
      gap: 3px;
      align-items: center;
      overflow-x: auto;
      scrollbar-width: none;
      flex-wrap: nowrap;
    }
    .cl-filter-bar::-webkit-scrollbar {
      display: none;
    }
    .cl-filter-btn {
      position: relative;
      padding: 6px 10px;
      background: var(--subtle);
      border: 1px solid var(--border);
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: var(--sub);
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 12px;
      flex-shrink: 0;
    }
    .cl-filter-btn:hover {
      background: var(--hover);
      color: var(--text);
    }
    .cl-filter-btn.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
      font-weight: 600;
    }
    .cl-f-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--missed);
      flex-shrink: 0;
    }
    .cl-sort-btn {
      margin-left: auto;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: var(--muted);
      padding: 4px 8px;
      border-radius: 6px;
      flex-shrink: 0;
      margin-bottom: 12px;
      font-family: monospace;
    }
    .cl-sort-btn:hover { background: var(--hover); }
    .cl-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 40px 20px;
      font-size: 13px;
      color: var(--muted);
    }
    .cl-spin {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .cl-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 60px 20px;
    }
    .cl-empty-icon {
      font-size: 40px;
      opacity: 0.4;
    }
    .cl-empty p {
      font-size: 14px;
      color: var(--muted);
      margin: 0;
      text-transform: capitalize;
    }
    .cl-list {
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
    .cl-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
      transition: background 0.1s;
      min-height: 60px;
    }
    .cl-item:last-child { border-bottom: none; }
    .cl-item:hover,
    .cl-item.hovered { background: var(--hover); }
    .cl-av-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .cl-av {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      color: white;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .cl-av img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .cl-type-badge {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      background: var(--white);
      border-radius: 50%;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .cl-info { flex: 1; min-width: 0; }
    .cl-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cl-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 500;
      margin-top: 3px;
      color: var(--sub);
    }
    .cl-status.missed   { color: var(--missed); }
    .cl-status.outgoing { color: var(--sub); }
    .cl-status.incoming { color: var(--sub); }
    .cl-status-icon {
      font-size: 11px;
      flex-shrink: 0;
    }
    .cl-duration {
      color: var(--muted);
      font-weight: 400;
    }
    .cl-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 90px;
      flex-shrink: 0;
    }
    .cl-time {
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .cl-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateX(4px); }
      to   { opacity: 1; transform: translateX(0);   }
    }
    .cl-act-btn {
      width: 32px;
      height: 32px;
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: var(--sub);
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: 1px;
      font-family: monospace;
    }
    .cl-act-btn:hover { background: var(--hover); }
    .cl-call-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 20px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s;
      box-shadow: none;
    }
    .cl-call-btn:hover {
      background: var(--accent-hover);
      color: white;
      border-color: var(--accent-hover);
    }
  `]
})
export class CallLogComponent
  implements OnInit, OnDestroy {

  private chatService = inject(ChatService);
  private cdr         = inject(ChangeDetectorRef);

  logs:         any[]      = [];
  loading                  = false;
  activeFilter: LogFilter  = 'all';
  missedCount              = 0;
  hoveredId: string | null = null;

  readonly filters: { key: LogFilter; label: string }[] = [
    { key: 'all',      label: 'All'      },
    { key: 'missed',   label: 'Missed'   },
    { key: 'incoming', label: 'Incoming' },
    { key: 'outgoing', label: 'Outgoing' }
  ];

  private subs: Subscription[] = [];

  ngOnInit() {
    this.loadLogs();
    this.loadMissedCount();

    this.subs.push(
      this.chatService.callEnded$.subscribe((d: any) => {
        if (!d) return;
        setTimeout(() => {
          this.loadLogs();
          this.loadMissedCount();
        }, 800);
      })
    );

    this.subs.push(
      this.chatService.callRejected$.subscribe((d: any) => {
        if (!d) return;
        setTimeout(() => {
          this.loadLogs();
          this.loadMissedCount();
        }, 800);
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ─── BUG FIX 1 ────────────────────────────────────────────
  // API returns plain array directly (not {data: []})
  // Old: this.logs = res.data || [];   ← WRONG, always empty
  // New: Array.isArray(res) check      ← CORRECT
  // ──────────────────────────────────────────────────────────
  loadLogs() {
    this.loading = true;
    this.cdr.detectChanges();

    this.chatService
      .getCallLogs(this.activeFilter)
      .subscribe({
        next: (res: any) => {
          this.logs    = Array.isArray(res) ? res : (res.data || []);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
  }

  loadMissedCount() {
    this.chatService.getMissedCallCount()
      .subscribe({
        next: (r: any) => {
          this.missedCount = r.count || 0;
          this.cdr.detectChanges();
        },
        error: () => {}
      });
  }

  setFilter(f: LogFilter) {
    this.activeFilter = f;
    this.loadLogs();
  }

  // ─── BUG FIX 3 ────────────────────────────────────────────
  // Old: log.otherUser.id   ← CRASH, otherUser object doesn't exist
  // New: log.otherUserId    ← correct flat field from API
  // ──────────────────────────────────────────────────────────
  callBack(log: any, type: 'audio' | 'video') {
    this.chatService.startCallFromLog(
      log.otherUserId, type);
  }

  getStatusLabel(log: any): string {
    if (log.isOutgoing) {
      return log.status === 'answered'
        ? 'Outgoing'
        : log.status === 'cancelled'
          ? 'Cancelled'
          : 'Not answered';
    }
    return log.status === 'answered'
      ? 'Incoming'
      : log.status === 'rejected'
        ? 'Declined'
        : 'Missed incoming';
  }

  getStatusClass(log: any): string {
    if (log.isOutgoing) return 'outgoing';
    if (log.status === 'answered') return 'incoming';
    return 'missed';
  }

  getStatusIcon(log: any): string {
    if (log.isOutgoing) return '📤';
    if (log.status === 'answered') return '📥';
    return '📵';
  }

  getCallTypeIcon(log: any): string {
    return log.callType === 'video' ? '📹' : '📞';
  }

  getDurationStr(secs: number): string {
    if (!secs || secs <= 0) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }

  getTimeLabel(dateStr: string): string {
    if (!dateStr) return '';
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0)
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
    if (days === 1) return 'Yesterday';
    if (days < 7)
      return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ')
      .map((n: string) => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6',
      '#8b5cf6', '#ec4899'
    ];
    return colors[
      (name?.charCodeAt(0) || 0) % colors.length
    ];
  }
}