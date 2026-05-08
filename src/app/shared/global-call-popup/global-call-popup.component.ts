// ✅ FILE: src/app/shared/global-call-popup/global-call-popup.component.ts

import {
  Component, ChangeDetectorRef, inject, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GlobalCallNotificationService }
  from '../../services/global-call-notification.service';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-global-call-popup',
  standalone: true,
  imports: [CommonModule],
  template: `
<!-- ══════════════════════════════════════
     INCOMING CALL POPUP
══════════════════════════════════════ -->
<div class="gcall-overlay"
  *ngIf="callSvc.isVisible && callSvc.incomingCall">
  <div class="gcall-popup">

    <div class="gcall-ring-wrap">
      <div class="gcall-ring ring-1"></div>
      <div class="gcall-ring ring-2"></div>
      <div class="gcall-ring ring-3"></div>
      <div class="gcall-avatar"
        [style.background]="getAvatarColor(callSvc.incomingCall?.callerName)">
        {{ getInitials(callSvc.incomingCall?.callerName) }}
      </div>
    </div>

    <div class="gcall-info">
      <div class="gcall-type-badge">
        {{ callSvc.incomingCall?.callType === 'video' ? '📹' : '📞' }}
        Incoming {{ callSvc.incomingCall?.callType === 'video' ? 'Video' : 'Audio' }} Call
      </div>
      <div class="gcall-name">{{ callSvc.incomingCall?.callerName || 'Unknown' }}</div>
      <div class="gcall-sub">is calling you...</div>
    </div>

    <div class="gcall-actions">
      <button class="gcall-btn reject" type="button" (click)="decline()">
        <span class="gcall-btn-icon">📵</span>
        <span class="gcall-btn-label">Decline</span>
      </button>
      <button class="gcall-btn accept" type="button" (click)="accept()">
        <span class="gcall-btn-icon">📞</span>
        <span class="gcall-btn-label">Accept</span>
      </button>
    </div>

  </div>
</div>

<!-- ══════════════════════════════════════
     FLOATING MINI CALL BAR
     (shows when call active + minimized)
══════════════════════════════════════ -->
<div class="mini-call-bar"
  *ngIf="callSvc.isCallActive && callSvc.isMinimized">

  <div class="mini-pulse"></div>

  <div class="mini-avatar"
    [style.background]="getAvatarColor(callSvc.activeCall?.name)">
    {{ getInitials(callSvc.activeCall?.name) }}
  </div>

  <div class="mini-info" (click)="expandCall()">
    <div class="mini-name">{{ callSvc.activeCall?.name }}</div>
    <div class="mini-dur">
      <span class="mini-dot"></span>
      {{ callSvc.getMiniDuration() }}
    </div>
  </div>

  <button class="mini-btn open" type="button"
    title="Open call" (click)="expandCall()">
    ↗
  </button>

  <button class="mini-btn end" type="button"
    title="End call" (click)="endCall()">
    📵
  </button>

</div>
  `,
  styles: [`
    /* ── Incoming popup ── */
    .gcall-overlay {
      position: fixed;
      top: 20px; right: 24px;
      z-index: 99999;
      animation: slideIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
    }
    @keyframes slideIn {
      from { opacity:0; transform: translateY(-16px) scale(0.93); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }
    .gcall-popup {
      background: #fff;
      border-radius: 20px;
      padding: 24px 22px 20px;
      width: 280px;
      box-shadow: 0 0 0 1px rgba(0,0,0,.06),
                  0 10px 40px rgba(0,0,0,.18);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .gcall-ring-wrap {
      position: relative;
      width: 80px; height: 80px;
      display: flex; align-items: center; justify-content: center;
      margin-top: 4px;
    }
    .gcall-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(37,99,235,.25);
      animation: pulse 2s ease-out infinite;
    }
    .ring-1 { width:80px;height:80px; animation-delay:0s; }
    .ring-2 { width:100px;height:100px; animation-delay:.4s; }
    .ring-3 { width:120px;height:120px; animation-delay:.8s; }
    @keyframes pulse {
      0%   { opacity:.8; transform:scale(.85); }
      100% { opacity:0;  transform:scale(1.15); }
    }
    .gcall-avatar {
      width:62px; height:62px; border-radius:50%;
      color:#fff; font-size:22px; font-weight:700;
      display:flex; align-items:center; justify-content:center;
      position:relative; z-index:1;
      box-shadow: 0 4px 14px rgba(0,0,0,.2);
    }
    .gcall-info { text-align:center; }
    .gcall-type-badge {
      display:inline-flex; align-items:center; gap:5px;
      font-size:11px; font-weight:600; color:#2563eb;
      background:#eff6ff; padding:3px 10px; border-radius:20px;
      margin-bottom:8px; text-transform:uppercase; letter-spacing:.3px;
    }
    .gcall-name { font-size:18px; font-weight:700; color:#111827; }
    .gcall-sub  { font-size:13px; color:#9ca3af; margin-top:3px; }
    .gcall-actions { display:flex; gap:14px; margin-top:4px; }
    .gcall-btn {
      display:flex; flex-direction:column; align-items:center; gap:5px;
      padding:12px 20px; border:none; border-radius:14px;
      cursor:pointer; font-family:inherit;
      transition:all .15s; flex:1;
    }
    .gcall-btn-icon  { font-size:22px; line-height:1; }
    .gcall-btn-label { font-size:11px; font-weight:600; letter-spacing:.3px; }
    .gcall-btn.reject { background:#fef2f2; color:#ef4444; }
    .gcall-btn.reject:hover { background:#ef4444; color:#fff; transform:scale(1.04); }
    .gcall-btn.accept { background:#f0fdf4; color:#16a34a; }
    .gcall-btn.accept:hover { background:#16a34a; color:#fff; transform:scale(1.04); }
    .gcall-btn:active { transform:scale(.97) !important; }

    /* ── Floating mini call bar ── */
    .mini-call-bar {
      position: fixed;
      bottom: 24px; right: 24px;
      z-index: 99998;
      background: #1e293b;
      color: #fff;
      border-radius: 16px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.35);
      min-width: 220px;
      animation: slideUp .3s cubic-bezier(.34,1.56,.64,1);
      cursor: pointer;
    }
    @keyframes slideUp {
      from { opacity:0; transform:translateY(20px) scale(.95); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    .mini-pulse {
      position: absolute;
      top: -3px; left: -3px; right: -3px; bottom: -3px;
      border-radius: 18px;
      border: 2px solid rgba(34,197,94,.4);
      animation: miniPulse 2s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes miniPulse {
      0%,100% { opacity:.4; }
      50%      { opacity:.9; }
    }
    .mini-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .mini-info { flex: 1; min-width: 0; }
    .mini-name {
      font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .mini-dur {
      font-size: 11px; color: #94a3b8;
      display: flex; align-items: center; gap: 5px; margin-top: 2px;
    }
    .mini-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #22c55e;
      animation: blink 1s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes blink {
      0%,100% { opacity:1; }
      50%      { opacity:.3; }
    }
    .mini-btn {
      background: none; border: none; cursor: pointer;
      padding: 6px 8px; border-radius: 8px;
      font-size: 16px; line-height: 1;
      transition: background .15s;
      flex-shrink: 0;
    }
    .mini-btn.open { color: #93c5fd; }
    .mini-btn.open:hover { background: rgba(147,197,253,.15); }
    .mini-btn.end  { color: #fca5a5; }
    .mini-btn.end:hover { background: rgba(252,165,165,.15); }
  `]
})
export class GlobalCallPopupComponent implements OnInit, OnDestroy {

  callSvc    = inject(GlobalCallNotificationService);
  chatSvc    = inject(ChatService);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  ngOnInit() {
    this.subs.push(
      this.chatSvc.callAccepted$.subscribe(d => {
        if (!d) return;
        this.cdr.detectChanges();
      })
    );
    // ✅ 200ms refresh for mini bar duration + popup state sync
    setInterval(() => this.cdr.detectChanges(), 200);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  decline() {
    this.callSvc.rejectIncomingCall();
    this.cdr.detectChanges();
  }

  // ✅ FIX: Accept — force popup hide FIRST, then service call
  accept() {
    // Directly hide — service pe depend mat karo CDR ke liye
    this.callSvc.isVisible    = false;
    this.callSvc.incomingCall = null;
    this.cdr.detectChanges(); // turant Angular ko batao

    // Phir service logic
    this.callSvc.acceptIncomingCall();
  }

  expandCall() {
    this.callSvc.expandCall();
    this.cdr.detectChanges();
  }

  endCall() {
    // End call via endCallLocal on chat page (through stream)
    this.chatSvc.callEnded$.next({ ended: true });
    this.callSvc.endMiniBar();
    this.cdr.detectChanges();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]||'').join('').toUpperCase().slice(0,2);
  }

  getAvatarColor(name: string): string {
    const c = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return c[(name?.charCodeAt(0)||0) % c.length];
  }
}