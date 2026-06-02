// FILE: src/app/shared/components/global-call-popup/global-call-popup.component.ts

import {
  Component, ChangeDetectorRef, inject, OnInit, OnDestroy, ElementRef,
  ViewChild, Directive, Input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GlobalCallNotificationService }
  from '../../../core/services/global-call-notification.service';
import { ChatService } from '../../../core/services/chat.service';

/** Tiny attribute directive so we can bind a MediaStream to a
 *  `<video>` or `<audio>` element via Angular template syntax. */
@Directive({ selector: '[srcObject]', standalone: true })
export class SrcObjectDirective {
  @Input() set srcObject(s: MediaStream | null) {
    (this.el.nativeElement as HTMLMediaElement).srcObject = s;
  }
  constructor(private el: ElementRef) {}
}

@Component({
  selector: 'app-global-call-popup',
  standalone: true,
  imports: [CommonModule, FormsModule, SrcObjectDirective],
  template: `
<!-- ══════════════════════════════════════     CONFERENCE / GROUP CALL INVITE POPUP
     (only when not already in a call)
═══════════════════════════════════════ -->
<div class="gcall-overlay"
  *ngIf="callSvc.conferenceInvite && !callSvc.isCallActive">
  <div class="gcall-popup">
    <div class="gcall-ring-wrap">
      <div class="gcall-ring ring-1"></div>
      <div class="gcall-ring ring-2"></div>
      <div class="gcall-ring ring-3"></div>
      <div class="gcall-avatar"
        [style.background]="getAvatarColor(getInviteFromName())">
        {{ getInitials(getInviteFromName()) }}
      </div>
    </div>
    <div class="gcall-info">
      <div class="gcall-type-badge">
        👥 Group {{ getInviteCallType() === 'video' ? 'Video' : 'Audio' }} Call
      </div>
      <div class="gcall-name">{{ getInviteFromName() }}</div>
      <div class="gcall-sub">
        is inviting you to join a call
        <span *ngIf="getInviteParticipantCount() > 1">
          ({{ getInviteParticipantCount() }} people)
        </span>
      </div>
    </div>
    <div class="gcall-actions">
      <button class="gcall-btn reject" type="button"
        (click)="declineConference()">
        <span class="gcall-btn-icon">📵</span>
        <span class="gcall-btn-label">Decline</span>
      </button>
      <button class="gcall-btn accept" type="button"
        (click)="acceptConference()">
        <span class="gcall-btn-icon">📞</span>
        <span class="gcall-btn-label">Join</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════     INCOMING CALL POPUP
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
     ACTIVE CALL — TEAMS-STYLE LAYOUT
══════════════════════════════════════ -->
<div class="floating-call-wrap"
  *ngIf="showFloatingWindow"
  [class.is-conf]="callSvc.isConference"
  #floatingCallWindow>

  <!-- Header -->
  <div class="fcw-head">
    <div class="fcw-title-row">
      <button class="fcw-back" type="button" title="Minimize" (click)="minimizeCall()">←</button>
      <div class="fcw-title-info">
        <div class="fcw-call-name">{{ getCallTitle() }}</div>
        <span class="fcw-team-chip">
          {{ callSvc.isConference ? '👥 Team' : '🟢 Direct' }}
        </span>
      </div>
    </div>
    <div class="fcw-head-stats">
      <span class="fcw-stat">
        <span class="dot inv"></span> Invited to the call:
        <strong>{{ getParticipantCount() }}</strong>
      </span>
      <button class="fcw-add-btn" type="button" (click)="openInvitePicker()">
        ➕ Add user to the call
      </button>
    </div>
  </div>

  <!-- Roster strip: who's in this call right now -->
  <div class="fcw-roster" *ngIf="getCallRoster().length > 0">
    <div class="fcw-roster-label">In this call:</div>
    <div class="fcw-roster-list">
      <div class="fcw-roster-chip"
        *ngFor="let p of getCallRoster()"
        [class.connected]="p.connected"
        [class.is-me]="p.isMe"
        [class.speaking]="isSpeaking(p.id)"
        [title]="p.name + (p.connected ? ' • Connected' : ' • Connecting…')">
        <div class="fcw-roster-av"
          [style.background]="getAvatarColor(p.name)">
          {{ getInitials(p.name) }}
          <span class="fcw-roster-dot"
            [class.on]="p.connected"></span>
        </div>
        <div class="fcw-roster-name">
          {{ p.isMe ? 'You' : p.name }}
        </div>
      </div>
    </div>
  </div>

  <!-- Connection notice -->
  <div class="floating-conn" *ngIf="showConnectionNotice" [class.warn]="connectionTone === 'warn'">
    {{ connectionLabel }}
  </div>

  <!-- Body: stage (video) + chat sidebar -->
  <div class="fcw-body">
    <!-- ── STAGE ── -->
    <div class="fcw-stage">
      <!-- Publisher info chip -->
      <div class="fcw-pub-chip">
        <div class="fcw-pub-av"
          [style.background]="getAvatarColor(getPublisherName())">
          {{ getInitials(getPublisherName()) }}
        </div>
        <div>
          <div class="fcw-pub-label">Publisher</div>
          <div class="fcw-pub-name">{{ getPublisherName() }}</div>
        </div>
      </div>
      <div class="fcw-timer-chip">
        <span class="rec-dot"></span>{{ callSvc.getMiniDuration() }}
      </div>

      <!-- Main visual: video or large avatar -->
      <ng-container *ngIf="callSvc.callType === 'video' && getMainStream(); else stageAudio">
        <video class="fcw-main-video"
          #popupRemoteVideo
          autoplay playsinline
          [srcObject]="getMainStream()"></video>
      </ng-container>
      <ng-template #stageAudio>
        <div class="fcw-stage-audio">
          <div class="fcw-stage-avatar"
            [style.background]="getAvatarColor(getPublisherName())">
            {{ getInitials(getPublisherName()) }}
          </div>
          <div class="fcw-stage-name">{{ getPublisherName() }}</div>
          <div class="fcw-stage-state">
            {{ callSvc.callType === 'video' ? 'Camera off' : 'Voice call' }}
          </div>
        </div>
      </ng-template>

      <!-- Hidden audio element for remote (single peer fallback) -->
      <audio #popupRemoteAudio autoplay playsinline style="display:none"></audio>
      <!-- Audio sinks for every peer (so audio works in conference) -->
      <audio *ngFor="let p of getTiles(); trackBy: trackTile"
        autoplay playsinline
        [srcObject]="p.stream"
        style="display:none"></audio>

      <!-- Local PIP -->
      <video *ngIf="callSvc.callType === 'video' && callSvc.localStream"
        class="fcw-local-pip"
        #popupLocalVideo
        autoplay playsinline muted
        [srcObject]="callSvc.localStream"></video>

      <!-- Side participant strip -->
      <div class="fcw-strip" *ngIf="getStripTiles().length > 0">
        <div class="fcw-strip-tile"
          *ngFor="let p of getStripTiles(); trackBy: trackTile"
          (click)="setMainTile(p.id)"
          [class.active]="mainTileId === p.id">
          <ng-container *ngIf="callSvc.callType === 'video' && p.stream; else stripAv">
            <video class="fcw-strip-video" autoplay playsinline muted
              [srcObject]="p.stream"></video>
          </ng-container>
          <ng-template #stripAv>
            <div class="fcw-strip-av"
              [style.background]="getAvatarColor(p.name)">
              {{ getInitials(p.name) }}
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Bottom control bar -->
      <div class="fcw-controls">
        <button class="ctl" type="button" title="Fullscreen" (click)="toggleFullscreen()">⛶</button>
        <button class="ctl" type="button" title="Mute" [class.active]="isMuted" (click)="toggleMute()">
          {{ isMuted ? '🔇' : '🎙' }}
        </button>
        <button class="ctl ctl-end" type="button" title="End call" (click)="endCall()">📞</button>
        <button class="ctl" type="button" title="Camera"
          *ngIf="callSvc.callType === 'video'"
          [class.active]="isCameraOff" (click)="toggleCamera()">
          {{ isCameraOff ? '📵' : '📷' }}
        </button>
        <button class="ctl" type="button" title="Minimize" (click)="minimizeCall()">▁</button>
      </div>
    </div>

    <!-- ── CHAT SIDEBAR ── -->
    <aside class="fcw-chat">
      <div class="fcw-chat-head">
        <div class="fcw-chat-title">
          {{ callSvc.isConference ? 'Group Chat' : (activeCallName + ' — Chat') }}
        </div>
        <div class="fcw-chat-tabs">
          <span class="tab active">Messages</span>
          <span class="tab" (click)="openInvitePicker()">Participants</span>
        </div>
      </div>
      <div class="fcw-chat-body" #chatScroll>
        <div *ngIf="callSvc.callMessages.length === 0" class="fcw-chat-empty">
          No messages yet — say hi 👋
        </div>
        <div class="fcw-msg" *ngFor="let m of callSvc.callMessages; let i = index"
          [class.mine]="m.mine">
          <div class="fcw-msg-from" *ngIf="!m.mine">{{ m.fromName }}</div>
          <div class="fcw-bubble">{{ m.text }}</div>
          <div class="fcw-msg-time">{{ formatMsgTime(m.at) }}</div>
        </div>
      </div>
      <div class="fcw-chat-input">
        <input type="text"
          placeholder="Write your message..."
          [(ngModel)]="chatDraft"
          (keydown.enter)="sendChat()" />
        <button class="fcw-send" type="button"
          [disabled]="!chatDraft.trim()"
          (click)="sendChat()">➤</button>
      </div>
    </aside>
  </div>

  <!-- Add-people picker modal (in-popup) -->
  <div class="invite-picker" *ngIf="showInvitePicker">
    <div class="ip-card">
      <div class="ip-head">
        <strong>Add people to call</strong>
        <button class="ip-x" type="button" (click)="closeInvitePicker()">✕</button>
      </div>
      <input class="ip-search" type="text"
        placeholder="Search..."
        [(ngModel)]="inviteSearch" />
      <div class="ip-list">
        <div *ngIf="loadingInviteUsers" class="ip-empty">Loading…</div>
        <label class="ip-row"
          *ngFor="let u of filteredInviteUsers()">
          <input type="checkbox"
            [checked]="inviteSelected.has(u.id)"
            (change)="toggleInviteUser(u.id)" />
          <div class="ip-av"
            [style.background]="getAvatarColor(u.fullName)">
            {{ getInitials(u.fullName) }}
          </div>
          <div class="ip-info">
            <div class="ip-name">{{ u.fullName }}</div>
            <div class="ip-mail">{{ u.email }}</div>
          </div>
        </label>
        <div *ngIf="!loadingInviteUsers && filteredInviteUsers().length === 0"
          class="ip-empty">No matches</div>
      </div>
      <div class="ip-foot">
        <button type="button" class="ip-btn ghost" (click)="closeInvitePicker()">Cancel</button>
        <button type="button" class="ip-btn primary"
          [disabled]="inviteSelected.size === 0"
          (click)="confirmInvite()">
          Invite ({{ inviteSelected.size }})
        </button>
      </div>
    </div>
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

    /* ── Active floating call window — Teams-style ── */
    .floating-call-wrap {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: min(1200px, 96vw);
      height: min(720px, 92vh);
      background: #f3f4f6;
      color: #1f2937;
      border-radius: 18px;
      overflow: hidden;
      z-index: 99997;
      box-shadow: 0 24px 80px rgba(0,0,0,.45);
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(0,0,0,.06);
    }
    /* Header */
    .fcw-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      gap: 12px;
      flex-wrap: wrap;
    }
    .fcw-title-row {
      display: flex; align-items: center; gap: 10px; min-width: 0;
    }
    .fcw-back {
      width: 32px; height: 32px; border-radius: 8px;
      border: 0; background: #f3f4f6; cursor: pointer;
      font-size: 16px; color: #374151;
    }
    .fcw-back:hover { background: #e5e7eb; }
    .fcw-title-info {
      display: flex; align-items: center; gap: 10px;
    }
    .fcw-call-name {
      font-size: 18px; font-weight: 700; color: #111827;
      max-width: 320px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .fcw-team-chip {
      font-size: 12px; font-weight: 600;
      padding: 4px 10px; border-radius: 999px;
      background: #ede9fe; color: #6d28d9;
    }
    .fcw-head-stats {
      display: flex; align-items: center; gap: 14px;
      font-size: 13px; color: #6b7280;
    }
    .fcw-stat .dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: #34d399; margin-right: 6px;
    }
    .fcw-stat strong {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 22px; height: 22px; border-radius: 50%;
      background: #fee2e2; color: #b91c1c; font-size: 12px;
      padding: 0 6px; margin-left: 4px;
    }
    .fcw-add-btn {
      border: 0; cursor: pointer;
      background: #10b981; color: #fff;
      padding: 8px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 600;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .fcw-add-btn:hover { background: #059669; }

    /* Roster strip — Teams-style "who's in this call" */
    .fcw-roster {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #fafafa;
      overflow-x: auto;
    }
    .fcw-roster-label {
      font-size: 12px; font-weight: 600; color: #6b7280;
      white-space: nowrap; flex-shrink: 0;
    }
    .fcw-roster-list {
      display: flex; align-items: center; gap: 8px;
      flex-wrap: nowrap;
    }
    .fcw-roster-chip {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 12px 4px 4px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 999px;
      flex-shrink: 0;
      transition: all .15s ease;
    }
    .fcw-roster-chip.connected {
      border-color: #10b981;
      box-shadow: 0 0 0 2px rgba(16,185,129,.1);
    }
    .fcw-roster-chip.is-me {
      background: #eef2ff;
      border-color: #6366f1;
    }
    .fcw-roster-chip.speaking {
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16,185,129,.35);
      animation: fcwSpeakingPulse 1s ease-in-out infinite;
    }
    .fcw-roster-chip.speaking .fcw-roster-av {
      animation: fcwAvPulse 1s ease-in-out infinite;
    }
    @keyframes fcwSpeakingPulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(16,185,129,.30); }
      50%      { box-shadow: 0 0 0 6px rgba(16,185,129,.55); }
    }
    @keyframes fcwAvPulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.08); }
    }
    .fcw-roster-av {
      position: relative;
      width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 700; font-size: 12px;
      flex-shrink: 0;
    }
    .fcw-roster-dot {
      position: absolute; bottom: -1px; right: -1px;
      width: 10px; height: 10px; border-radius: 50%;
      background: #9ca3af;
      border: 2px solid #fff;
    }
    .fcw-roster-dot.on { background: #10b981; }
    .fcw-roster-name {
      font-size: 13px; font-weight: 500; color: #374151;
      white-space: nowrap;
    }

    /* Body */
    .fcw-body {
      flex: 1; min-height: 0;
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 0;
    }
    /* Stage */
    .fcw-stage {
      position: relative;
      background: #111827;
      overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    .fcw-pub-chip {
      position: absolute; top: 14px; left: 14px;
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,.92);
      padding: 6px 12px 6px 6px; border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
      z-index: 3;
    }
    .fcw-pub-av {
      width: 34px; height: 34px; border-radius: 50%;
      color: #fff; font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .fcw-pub-label { font-size: 10px; color: #6b7280; line-height: 1; }
    .fcw-pub-name { font-size: 13px; font-weight: 700; color: #111827; }
    .fcw-timer-chip {
      position: absolute; top: 14px; right: 14px;
      background: rgba(255,255,255,.92);
      padding: 6px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700; color: #111827;
      display: inline-flex; align-items: center; gap: 8px;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
      z-index: 3;
    }
    .rec-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444; animation: blink 1s ease-in-out infinite;
    }
    .fcw-main-video {
      width: 100%; height: 100%; object-fit: cover; display: block;
      background: #000;
    }
    .fcw-stage-audio {
      display: flex; flex-direction: column; align-items: center; gap: 14px;
      color: #fff;
    }
    .fcw-stage-avatar {
      width: 140px; height: 140px; border-radius: 50%;
      color: #fff; font-size: 50px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 8px rgba(255,255,255,.08);
    }
    .fcw-stage-name { font-size: 22px; font-weight: 700; }
    .fcw-stage-state { font-size: 14px; color: #94a3b8; }

    .fcw-local-pip {
      position: absolute; right: 16px; bottom: 92px;
      width: 160px; height: 110px;
      border-radius: 12px; object-fit: cover;
      border: 2px solid #fff;
      background: #1e293b; z-index: 2;
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }

    /* Side strip */
    .fcw-strip {
      position: absolute; right: 14px; top: 64px;
      display: flex; flex-direction: column; gap: 10px;
      max-height: calc(100% - 160px); overflow-y: auto;
      z-index: 2;
    }
    .fcw-strip-tile {
      width: 78px; height: 78px; border-radius: 50%;
      overflow: hidden; cursor: pointer;
      border: 3px solid transparent;
      transition: border-color .15s, transform .15s;
      background: #1f2937;
    }
    .fcw-strip-tile:hover { transform: scale(1.04); }
    .fcw-strip-tile.active { border-color: #10b981; }
    .fcw-strip-video {
      width: 100%; height: 100%; object-fit: cover;
    }
    .fcw-strip-av {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 22px; font-weight: 700;
    }

    /* Controls overlay */
    .fcw-controls {
      position: absolute;
      bottom: 16px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px;
      background: rgba(31,41,55,.65);
      backdrop-filter: blur(6px);
      padding: 8px 12px; border-radius: 999px;
      z-index: 3;
    }
    .fcw-controls .ctl {
      width: 44px; height: 44px; border-radius: 50%;
      border: 0; cursor: pointer;
      background: rgba(255,255,255,.18); color: #fff;
      font-size: 17px; line-height: 1;
      transition: all .15s;
    }
    .fcw-controls .ctl:hover { background: rgba(255,255,255,.3); }
    .fcw-controls .ctl.active {
      background: rgba(239,68,68,.85); color: #fff;
    }
    .fcw-controls .ctl-end {
      width: 56px; height: 56px;
      background: #ef4444;
    }
    .fcw-controls .ctl-end:hover { background: #dc2626; }

    .floating-conn {
      padding: 6px 14px; font-size: 12px; font-weight: 600;
      color: #1e3a8a; background: #dbeafe;
      border-bottom: 1px solid #bfdbfe;
    }
    .floating-conn.warn { color: #92400e; background: #fef3c7; border-color: #fde68a; }

    /* Chat sidebar */
    .fcw-chat {
      background: #fff;
      border-left: 1px solid #e5e7eb;
      display: flex; flex-direction: column;
      min-height: 0;
    }
    .fcw-chat-head {
      padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
    }
    .fcw-chat-title { font-size: 14px; font-weight: 700; color: #111827; }
    .fcw-chat-tabs {
      display: flex; gap: 4px;
    }
    .fcw-chat-tabs .tab {
      font-size: 12px; padding: 4px 10px; border-radius: 6px;
      color: #6b7280; cursor: pointer;
    }
    .fcw-chat-tabs .tab.active { color: #10b981; font-weight: 700; }
    .fcw-chat-tabs .tab:hover:not(.active) { background: #f3f4f6; }

    .fcw-chat-body {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f9fafb;
    }
    .fcw-chat-empty {
      color: #9ca3af; font-size: 13px; text-align: center;
      margin-top: 40px;
    }
    .fcw-msg { display: flex; flex-direction: column; max-width: 80%; }
    .fcw-msg.mine { align-self: flex-end; align-items: flex-end; }
    .fcw-msg-from {
      font-size: 11px; color: #6b7280; margin-bottom: 2px; padding-left: 4px;
    }
    .fcw-bubble {
      background: #fff; padding: 8px 12px; border-radius: 12px;
      font-size: 13px; color: #111827;
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
      word-break: break-word;
    }
    .fcw-msg.mine .fcw-bubble {
      background: #d1fae5; color: #064e3b;
    }
    .fcw-msg-time {
      font-size: 10px; color: #9ca3af; margin-top: 2px; padding: 0 4px;
    }
    .fcw-chat-input {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid #e5e7eb; background: #fff;
    }
    .fcw-chat-input input {
      flex: 1; padding: 10px 14px; border-radius: 999px;
      border: 1px solid #e5e7eb; outline: none; font-size: 13px;
      background: #f9fafb;
    }
    .fcw-chat-input input:focus { border-color: #10b981; background: #fff; }
    .fcw-send {
      width: 38px; height: 38px; border-radius: 50%; border: 0;
      background: #10b981; color: #fff; cursor: pointer;
      font-size: 14px;
    }
    .fcw-send:disabled { background: #d1d5db; cursor: not-allowed; }
    .fcw-send:hover:not(:disabled) { background: #059669; }

    @media (max-width: 900px) {
      .floating-call-wrap {
        width: 100vw; height: 100vh; border-radius: 0;
        top: 0; left: 0; transform: none;
      }
      .fcw-body { grid-template-columns: 1fr; }
      .fcw-chat { display: none; }
      .floating-call-wrap.show-chat .fcw-chat { display: flex; }
    }

    /* ── Conference grid ── */
    .conf-grid {
      flex: 1; display: grid; gap: 8px; padding: 10px;
      background: #020617; overflow: auto;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }
    .conf-tile {
      position: relative;
      background: #0f172a;
      border-radius: 10px;
      overflow: hidden;
      aspect-ratio: 1 / 1;
      display: flex; align-items: center; justify-content: center;
    }
    .conf-video {
      width: 100%; height: 100%; object-fit: cover;
    }
    .conf-avatar {
      width: 64px; height: 64px; border-radius: 50%;
      color: #fff; font-size: 20px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 4px rgba(59,130,246,.25);
    }
    .conf-name {
      position: absolute; bottom: 4px; left: 6px;
      font-size: 11px; color: #fff;
      background: rgba(0,0,0,.55); padding: 2px 8px;
      border-radius: 6px;
    }

    /* ── Add-people picker ── */
    .fcc-btn.add { padding: 0 12px; gap: 4px; font-size: 12px; font-weight: 600; }
    .invite-picker {
      position: absolute; inset: 0;
      background: rgba(2,6,23,.65);
      display: flex; align-items: center; justify-content: center;
      z-index: 10;
    }
    .ip-card {
      width: 280px; background: #fff; border-radius: 14px;
      padding: 14px; display: flex; flex-direction: column; gap: 10px;
      max-height: 80%;
      box-shadow: 0 10px 40px rgba(0,0,0,.45);
    }
    .ip-head { display:flex; justify-content:space-between; align-items:center; }
    .ip-x {
      background: transparent; border: 0; cursor: pointer; font-size: 16px;
      color: #6b7280;
    }
    .ip-search {
      width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb;
      border-radius: 8px; outline: none; font-size: 13px;
    }
    .ip-list {
      flex: 1; overflow-y: auto; max-height: 220px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .ip-row {
      display: flex; align-items: center; gap: 10px;
      padding: 6px; border-radius: 8px; cursor: pointer;
    }
    .ip-row:hover { background: #f3f4f6; }
    .ip-av {
      width: 32px; height: 32px; border-radius: 50%;
      color: #fff; font-size: 12px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
    }
    .ip-info { flex: 1; min-width: 0; }
    .ip-name { font-size: 13px; font-weight: 600; color: #111827; }
    .ip-mail { font-size: 11px; color: #6b7280; }
    .ip-empty {
      padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;
    }
    .ip-foot {
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .ip-btn {
      padding: 7px 14px; border-radius: 8px; border: 0; cursor: pointer;
      font-size: 12px; font-weight: 600;
    }
    .ip-btn.ghost { background: #f3f4f6; color: #374151; }
    .ip-btn.primary { background: #2563eb; color: #fff; }
    .ip-btn.primary:disabled { opacity: .5; cursor: not-allowed; }
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
    return this.callSvc.isCallActive && !this.callSvc.isMinimized;
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

    // Auto-scroll chat when a new in-call message arrives.
    this.subs.push(
      this.callSvc.callChatChanged$.subscribe(() => {
        this.cdr.detectChanges();
        setTimeout(() => this.scrollChatToBottom(), 30);
      })
    );

    // Re-render when conference roster/streams change.
    this.subs.push(
      this.callSvc.conferenceChanged$.subscribe(() => {
        this.cdr.detectChanges();
      })
    );

    // Re-render whenever someone starts/stops speaking so the roster
    // chips pulse like Microsoft Teams.
    this.subs.push(
      this.callSvc.speakingChanged$.subscribe(() => {
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

  // ── Conference invite popup actions ────────────────────────
  acceptConference() {
    this.callSvc.acceptConferenceInvite();
    this.cdr.detectChanges();
  }
  declineConference() {
    this.callSvc.rejectConferenceInvite();
    this.cdr.detectChanges();
  }
  getInviteFromName(): string {
    const i = this.callSvc.conferenceInvite;
    return i?.fromName || i?.FromName || 'Someone';
  }
  getInviteCallType(): 'audio' | 'video' {
    const i = this.callSvc.conferenceInvite;
    return (i?.callType || i?.CallType || 'audio') as 'audio' | 'video';
  }
  getInviteParticipantCount(): number {
    const i = this.callSvc.conferenceInvite;
    const list = i?.participants || i?.Participants || [];
    return Array.isArray(list) ? list.length : 0;
  }

  // ── Conference grid tiles ──────────────────────────────────
  getTiles() { return this.callSvc.getConferenceTiles(); }
  trackTile = (_: number, p: { id: string }) => p.id;

  // ── Stage / chat helpers (Teams-style layout) ──────────────
  mainTileId: string | null = null;
  chatDraft = '';

  setMainTile(id: string) {
    this.mainTileId = id;
    this.cdr.detectChanges();
  }

  getCallTitle(): string {
    if (this.callSvc.isConference) {
      const names = Array.from(this.callSvc.participants.values())
        .map(p => p.name).filter(Boolean);
      if (names.length === 0) return 'Group Call';
      if (names.length === 1) return names[0] + ' & you';
      return names.slice(0, 2).join(', ')
        + (names.length > 2 ? ` +${names.length - 2}` : '');
    }
    return this.activeCallName;
  }

  getPublisherName(): string {
    if (this.callSvc.isConference) {
      const tiles = this.getTiles();
      const main = this.getMainTileObj(tiles);
      return main?.name || 'Participant';
    }
    return this.activeCallName;
  }

  /** Stream to show in the big stage area. */
  getMainStream(): MediaStream | null {
    if (this.callSvc.isConference) {
      const tiles = this.getTiles();
      const main = this.getMainTileObj(tiles);
      return main?.stream || null;
    }
    return this.callSvc.remoteStream || null;
  }

  /** Tiles for the side strip (everyone except the main one). */
  getStripTiles() {
    if (!this.callSvc.isConference) return [];
    const tiles = this.getTiles();
    if (tiles.length <= 1) return [];
    const main = this.getMainTileObj(tiles);
    return tiles.filter(t => t.id !== main?.id);
  }

  private getMainTileObj(tiles: ReturnType<typeof this.getTiles>) {
    if (!tiles.length) return null;
    if (this.mainTileId) {
      const m = tiles.find(t => t.id === this.mainTileId);
      if (m) return m;
    }
    return tiles[0];
  }

  getParticipantCount(): number {
    // self + remote participants
    return 1 + (this.callSvc.isConference
      ? this.callSvc.participants.size
      : (this.callSvc.activeCallOtherId ? 1 : 0));
  }

  /**
   * Roster of every person in the active call: yourself first, then each
   * remote participant. `connected` = we have an active media stream from
   * them (so audio/video is flowing). Used for the Teams-style chip strip
   * under the call header.
   */
  getCallRoster(): Array<{
    id: string;
    name: string;
    isMe: boolean;
    connected: boolean;
  }> {
    const myId = this.callSvc.myUserId || 'me';
    const myName = this.authNameOrFallback();
    const list: Array<{
      id: string; name: string; isMe: boolean; connected: boolean
    }> = [{
      id: myId,
      name: myName,
      isMe: true,
      connected: !!this.callSvc.localStream
    }];

    if (this.callSvc.isConference) {
      const tiles = this.getTiles();
      this.callSvc.participants.forEach((p, id) => {
        const tile = tiles.find(t => t.id === id);
        list.push({
          id,
          name: p.name || 'Participant',
          isMe: false,
          connected: !!tile?.stream
        });
      });
    } else if (this.callSvc.activeCallOtherId) {
      list.push({
        id: this.callSvc.activeCallOtherId,
        name: this.activeCallName || 'Participant',
        isMe: false,
        connected: !!this.callSvc.remoteStream
      });
    }
    return list;
  }

  private authNameOrFallback(): string {
    const fromSvc = (this.callSvc.myUserName || '').trim();
    if (fromSvc) return fromSvc;
    try {
      const raw = localStorage.getItem('user_full_name')
        || localStorage.getItem('full_name')
        || localStorage.getItem('user_name');
      if (raw) return raw;
    } catch { /* noop */ }
    return 'You';
  }

  /** Is the given participant currently speaking? Used for the
   *  Teams-style avatar pulse on the roster chip. */
  isSpeaking(id: string): boolean {
    if (!id) return false;
    return this.callSvc.speakingIds.has(id);
  }

  formatMsgTime(at: Date): string {
    try {
      const d = new Date(at);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      return `${hh}:${mm}`;
    } catch { return ''; }
  }

  async sendChat() {
    const text = (this.chatDraft || '').trim();
    if (!text) return;
    this.chatDraft = '';
    await this.callSvc.sendCallMessage(text);
    this.cdr.detectChanges();
    setTimeout(() => this.scrollChatToBottom(), 50);
  }

  @ViewChild('chatScroll') chatScroll?: ElementRef<HTMLDivElement>;
  private scrollChatToBottom() {
    const el = this.chatScroll?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  // ── Add-people picker (in-popup) ───────────────────────────
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
    this.chatSvc.getChatUsers().subscribe({
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
  closeInvitePicker() { this.showInvitePicker = false; }
  toggleInviteUser(id: string) {
    if (this.inviteSelected.has(id)) this.inviteSelected.delete(id);
    else this.inviteSelected.add(id);
  }
  filteredInviteUsers(): any[] {
    const q = (this.inviteSearch || '').toLowerCase();
    // Exclude users already in the call.
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
