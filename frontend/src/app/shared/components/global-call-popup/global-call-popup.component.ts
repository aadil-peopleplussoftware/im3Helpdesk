// FILE: src/app/shared/components/global-call-popup/global-call-popup.component.ts

import {
  Component, ChangeDetectorRef, inject, OnInit, OnDestroy, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GlobalCallNotificationService }
  from '../../../core/services/global-call-notification.service';
import { ChatService } from '../../../core/services/chat.service';

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

<!-- ══════════════════════════════════════
     ACTIVE CALL FLOATING WINDOW
══════════════════════════════════════ -->
<div class="floating-call-wrap"
  *ngIf="showFloatingWindow"
  #floatingCallWindow>

  <div class="floating-call-head">
    <div class="fch-left">
      <span class="fch-dot"></span>
      <div>
        <div class="fch-title">
          {{ callSvc.callType === 'video' ? 'Video call' : 'Voice call' }}
        </div>
        <div class="fch-sub">
          {{ activeCallName }} · {{ callSvc.getMiniDuration() }}
        </div>
      </div>
    </div>

    <div class="fch-actions">
      <button class="fch-btn" type="button" title="Open chat" (click)="openInChat()">💬</button>
      <button class="fch-btn" type="button" title="Fullscreen" (click)="toggleFullscreen()">⛶</button>
      <button class="fch-btn" type="button" title="Minimize" (click)="minimizeCall()">▁</button>
      <button class="fch-btn end" type="button" title="End call" (click)="endCall()">📵</button>
    </div>
  </div>

  <div class="floating-conn" *ngIf="showConnectionNotice" [class.warn]="connectionTone === 'warn'">
    {{ connectionLabel }}
  </div>

  <div class="floating-call-body" *ngIf="callSvc.callType === 'video'; else voiceBody">
    <video class="fc-remote-video" #popupRemoteVideo autoplay playsinline></video>
    <video class="fc-local-video" #popupLocalVideo autoplay playsinline muted></video>
    <audio #popupRemoteAudio autoplay playsinline style="display:none"></audio>
  </div>

  <ng-template #voiceBody>
    <div class="voice-wrap">
      <div class="voice-avatar" [style.background]="getAvatarColor(activeCallName)">
        {{ getInitials(activeCallName) }}
      </div>
      <div class="voice-name">{{ activeCallName }}</div>
      <div class="voice-label">Call is active in background</div>
      <audio #popupRemoteAudio autoplay playsinline style="display:none"></audio>
    </div>
  </ng-template>

  <div class="floating-call-controls">
    <button class="fcc-btn" type="button" title="Mute microphone" [class.active]="isMuted" (click)="toggleMute()">
      {{ isMuted ? '🔇' : '🎙' }}
    </button>
    <button class="fcc-btn" type="button" title="Toggle camera" *ngIf="callSvc.callType === 'video'" [class.active]="isCameraOff" (click)="toggleCamera()">
      {{ isCameraOff ? '📵' : '📷' }}
    </button>
  </div>
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

    /* ── Active floating call window ── */
    .floating-call-wrap {
      position: fixed;
      right: 24px;
      bottom: 92px;
      width: 360px;
      border-radius: 16px;
      overflow: hidden;
      background: #0f172a;
      color: #e2e8f0;
      z-index: 99997;
      box-shadow: 0 14px 40px rgba(0,0,0,.45);
      border: 1px solid rgba(148,163,184,.25);
    }
    .floating-call-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: rgba(15,23,42,.96);
      border-bottom: 1px solid rgba(148,163,184,.2);
    }
    .fch-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .fch-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: blink 1s ease-in-out infinite;
      flex-shrink: 0;
    }
    .fch-title {
      font-size: 12px;
      font-weight: 700;
      color: #f8fafc;
    }
    .fch-sub {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .fch-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .fch-btn {
      background: rgba(148,163,184,.16);
      border: none;
      color: #e2e8f0;
      border-radius: 8px;
      width: 30px;
      height: 30px;
      cursor: pointer;
      line-height: 1;
      transition: all .15s;
    }
    .fch-btn:hover { background: rgba(148,163,184,.32); }
    .fch-btn.end { color: #fca5a5; }
    .fch-btn.end:hover { background: rgba(127,29,29,.55); }

    .floating-call-body {
      position: relative;
      width: 100%;
      height: 210px;
      background: #020617;
    }
    .floating-conn {
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #dbeafe;
      background: rgba(30,64,175,.35);
      border-bottom: 1px solid rgba(148,163,184,.18);
      letter-spacing: .2px;
    }
    .floating-conn.warn {
      color: #fde68a;
      background: rgba(161,98,7,.35);
    }
    .fc-remote-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #020617;
    }
    .fc-local-video {
      position: absolute;
      right: 10px;
      bottom: 10px;
      width: 100px;
      height: 72px;
      border-radius: 10px;
      object-fit: cover;
      border: 2px solid rgba(248,250,252,.9);
      background: #1e293b;
    }
    .voice-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
      padding: 26px 10px;
      background: #020617;
    }
    .voice-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      color: #fff;
      font-size: 24px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 6px rgba(59,130,246,.2);
    }
    .voice-name {
      font-size: 15px;
      font-weight: 700;
      color: #f8fafc;
    }
    .voice-label {
      font-size: 12px;
      color: #94a3b8;
    }

    .floating-call-controls {
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 10px 12px 12px;
      background: rgba(15,23,42,.98);
      border-top: 1px solid rgba(148,163,184,.2);
    }
    .fcc-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: none;
      background: rgba(148,163,184,.16);
      color: #f8fafc;
      cursor: pointer;
      transition: all .15s;
    }
    .fcc-btn:hover { background: rgba(148,163,184,.32); }
    .fcc-btn.active {
      background: rgba(127,29,29,.55);
      color: #fecaca;
    }

    @media (max-width: 768px) {
      .floating-call-wrap {
        width: calc(100vw - 24px);
        right: 12px;
        bottom: 84px;
      }
    }
  `]
})
export class GlobalCallPopupComponent implements OnInit, OnDestroy {

  callSvc    = inject(GlobalCallNotificationService);
  chatSvc    = inject(ChatService);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);

  @ViewChild('floatingCallWindow') floatingCallWindow?: ElementRef<HTMLDivElement>;
  @ViewChild('popupRemoteVideo') popupRemoteVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('popupLocalVideo') popupLocalVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('popupRemoteAudio') popupRemoteAudio?: ElementRef<HTMLAudioElement>;

  isMuted = false;
  isCameraOff = false;
  isChatRoute = false;

  private subs: Subscription[] = [];
  private uiTick: any;

  get showFloatingWindow(): boolean {
    return this.callSvc.isCallActive && !this.callSvc.isMinimized && !this.isChatRoute;
  }

  get activeCallName(): string {
    return this.callSvc.activeCall?.name || this.callSvc.incomingCallData?.callerName || 'Active Call';
  }

  get showConnectionNotice(): boolean {
    const s = this.callSvc.rtcState;
    return this.showFloatingWindow && (s === 'connecting' || s === 'disconnected' || s === 'failed');
  }

  get connectionLabel(): string {
    const s = this.callSvc.rtcState;
    if (s === 'connecting') return 'Connecting call...';
    if (s === 'disconnected') return 'Reconnecting...';
    if (s === 'failed') return 'Connection failed';
    return '';
  }

  get connectionTone(): 'info' | 'warn' {
    return this.callSvc.rtcState === 'failed' ? 'warn' : 'info';
  }

  ngOnInit() {
    this.updateRouteState();

    this.subs.push(
      this.router.events.subscribe(evt => {
        if (evt instanceof NavigationEnd) {
          this.updateRouteState();
          this.syncStreams();
          this.cdr.detectChanges();
        }
      })
    );

    this.subs.push(
      this.chatSvc.callAccepted$.subscribe(d => {
        if (!d) return;
        this.syncStreams();
        this.cdr.detectChanges();
      })
    );

    this.subs.push(
      this.callSvc.remoteStream$.subscribe(() => {
        this.syncStreams();
        this.cdr.detectChanges();
      })
    );

    this.subs.push(
      this.chatSvc.callEnded$.subscribe(d => {
        if (!d) return;
        this.resetLocalControls();
      })
    );

    this.subs.push(
      this.chatSvc.callRejected$.subscribe(d => {
        if (!d) return;
        this.resetLocalControls();
      })
    );

    // Keep timer text and media bindings in sync while minimized/popup is alive.
    this.uiTick = setInterval(() => {
      this.syncStreams();
      this.cdr.detectChanges();
    }, 500);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    clearInterval(this.uiTick);
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
    this.openInChat();
    this.cdr.detectChanges();
  }

  endCall() {
    this.callSvc.endCall(true);
    this.resetLocalControls();
    this.cdr.detectChanges();
  }

  openInChat() {
    if (!this.isChatRoute) {
      this.router.navigate(['/chat']);
      setTimeout(() => this.callSvc.expandCall(), 80);
      return;
    }
    this.callSvc.expandCall();
  }

  minimizeCall() {
    this.callSvc.showMiniBar(this.activeCallName, this.callSvc.callType);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.callSvc.toggleMute(this.isMuted);
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    this.callSvc.toggleCamera(this.isCameraOff);
  }

  toggleFullscreen() {
    const target = this.floatingCallWindow?.nativeElement;
    if (!target) return;

    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      mozCancelFullScreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element;
      mozFullScreenElement?: Element;
      msFullscreenElement?: Element;
    };

    const isFs = !!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );

    if (!isFs) {
      const el = target as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };
      (el.requestFullscreen
        || el.webkitRequestFullscreen
        || el.mozRequestFullScreen
        || el.msRequestFullscreen
      )?.call(el);
      return;
    }

    (document.exitFullscreen
      || doc.webkitExitFullscreen
      || doc.mozCancelFullScreen
      || doc.msExitFullscreen
    )?.call(document);
  }

  private updateRouteState() {
    this.isChatRoute = this.router.url.startsWith('/chat');
  }

  private resetLocalControls() {
    this.isMuted = false;
    this.isCameraOff = false;
  }

  private syncStreams() {
    if (!this.showFloatingWindow) return;

    const remote = this.callSvc.remoteStream;
    const local = this.callSvc.localStream;

    if (this.popupRemoteVideo?.nativeElement && remote && this.callSvc.callType === 'video') {
      this.popupRemoteVideo.nativeElement.srcObject = remote;
    }

    if (this.popupRemoteAudio?.nativeElement && remote) {
      this.popupRemoteAudio.nativeElement.srcObject = remote;
      this.popupRemoteAudio.nativeElement.play().catch(() => {});
    }

    if (this.popupLocalVideo?.nativeElement && local && this.callSvc.callType === 'video') {
      this.popupLocalVideo.nativeElement.srcObject = local;
    }
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
