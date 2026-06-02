// FILE: src/app/core/services/global-call-notification.service.ts
// Root service — WebRTC yahan hai, tab/page change pe alive rahega

import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ChatService } from './chat.service';

export interface ConferenceParticipant {
  id: string;
  name: string;
  photoUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GlobalCallNotificationService implements OnDestroy {

  private chatSvc = inject(ChatService);
  private subs: Subscription[] = [];

  // ── Incoming popup ───────────────────────
  incomingCall: any = null;
  isVisible         = false;

  // ── Active call ──────────────────────────
  isCallActive  = false;
  isMinimized   = false;
  activeCall: any = null;
  callType: 'audio' | 'video' = 'audio';
  callDuration  = 0;
  rtcState: RTCPeerConnectionState = 'new';

  // ── WebRTC (yahan store — never destroyed) ──
  pc: RTCPeerConnection | null     = null;
  localStream: MediaStream | null  = null;
  remoteStream: MediaStream | null = null;
  iceCandidateQueue: RTCIceCandidateInit[] = [];
  isSettingRemoteAnswer = false;
  incomingCallData: any = null;
  activeCallOtherId     = '';

  // ── Conference state (mesh) ──────────────
  isConference = false;
  /** Active CallLog id, used as the conference roomId. */
  currentCallLogId: string | null = null;
  /** userId → RTCPeerConnection (one per remote peer). */
  peers = new Map<string, RTCPeerConnection>();
  /** userId → inbound MediaStream from that peer. */
  remoteStreams = new Map<string, MediaStream>();
  /** userId → ICE candidates queued before remoteDescription set. */
  private peerIceQueue = new Map<string, RTCIceCandidateInit[]>();
  /** Roster of remote participants currently in the call. */
  participants = new Map<string, ConferenceParticipant>();
  /** Pending conference invite popup data (when not yet in call). */
  conferenceInvite: any = null;

  // ── In-call ephemeral chat ───────────────
  callMessages: Array<{
    fromId: string; fromName: string;
    text: string; at: Date; mine: boolean;
  }> = [];
  callChatChanged$ = new BehaviorSubject<number>(0);
  /** Local user id, populated when call starts (used for `mine` flag). */
  myUserId: string | null = null;
  /** Local user display name, captured from JWT for use in the roster. */
  myUserName: string = '';
  private _seenMsgKeys = new Set<string>();

  // ── Speaking activity (Teams-style avatar blink) ──
  /** userId → true when their mic is currently producing audio. */
  speakingIds = new Set<string>();
  speakingChanged$ = new BehaviorSubject<number>(0);
  private _audioWatchers = new Map<string, () => void>();

  // ── Streams ──────────────────────────────
  expandCallRequest$ = new BehaviorSubject<boolean>(false);
  remoteStream$      = new BehaviorSubject<MediaStream | null>(null);
  /** Emits whenever conference roster / streams change so UI re-renders. */
  conferenceChanged$ = new BehaviorSubject<number>(0);

  private callTimer: any;
  private disconnectTimer: any;
  private _stopRingFn: (() => void) | null = null;
  private _navigateToChat: (() => void) | null = null;

  // ── Flag: prevent re-entrant endCall ────
  private _isEnding = false;

  // ─────────────────────────────────────────
  init(navigateToChatFn: () => void) {
    this._navigateToChat = navigateToChatFn;

    // Capture our own user id from JWT once for `mine` flag in chat.
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.myUserId = String(
          payload.sub || payload.nameid
          || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
          || ''
        ) || null;
        this.myUserName = String(
          payload.name
          || payload.fullName
          || payload.unique_name
          || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']
          || ''
        );
      }
    } catch {}

    // Incoming call → show popup
    this.subs.push(
      this.chatSvc.incomingCall$.subscribe(d => {
        if (!d) {
          // Stream null hua — popup hide
          this.isVisible    = false;
          this.incomingCall = null;
          this.stopRingtone();
          return;
        }
        // ✅ Agar call already active/minimized hai — popup mat dikhao
        if (this.isCallActive) return;
        this.incomingCall     = d;
        this.incomingCallData = d;
        this.isVisible        = true;
        this.callType         = d.callType || 'audio';
        this.currentCallLogId = d.callLogId || d.CallLogId || null;
        this.playRingtone();
      })
    );

    // Caller side: backend echoes the new CallLog id so we know our
    // conference roomId in case the user later promotes the call.
    this.subs.push(
      this.chatSvc.callInitiated$.subscribe(d => {
        if (!d) return;
        this.currentCallLogId = d.callLogId || d.CallLogId || null;
      })
    );

    // Outgoing call accepted by remote
    this.subs.push(
      this.chatSvc.callAccepted$.subscribe(async d => {
        if (!d || !this.pc) return;
        if (this.isSettingRemoteAnswer) return;
        if (this.pc.signalingState !== 'have-local-offer') return;
        try {
          this.isSettingRemoteAnswer = true;
          const ans = JSON.parse(d.answer);
          await this.pc.setRemoteDescription(
            new RTCSessionDescription(ans));
          await this.flushIceCandidates();
          this.isCallActive = true;
          this.isVisible    = false;
          this.incomingCall = null;
          this.startCallTimer();
        } catch (e) {
          console.error('callAccepted error:', e);
          this.endCall(false);
        } finally {
          this.isSettingRemoteAnswer = false;
        }
      })
    );

    // Remote ended the call
    this.subs.push(
      this.chatSvc.callEnded$.subscribe(d => {
        if (!d) return;
        this.hidePopup();
        this.endCall(false); // false = hub ko signal mat bhejo (remote ne bheja)
      })
    );

    // Call rejected
    this.subs.push(
      this.chatSvc.callRejected$.subscribe(d => {
        if (!d) return;
        this.hidePopup();
        this.endCall(false);
      })
    );

    // ICE candidates
    this.subs.push(
      this.chatSvc.iceCandidate$.subscribe(async d => {
        if (!d || !this.pc) return;
        try {
          const c = JSON.parse(d.candidate) as RTCIceCandidateInit;
          if (!this.pc.remoteDescription) {
            this.iceCandidateQueue.push(c);
          } else {
            await this.pc.addIceCandidate(new RTCIceCandidate(c));
          }
        } catch {}
      })
    );

    // ── Conference signaling ──────────────────────────

    this.subs.push(
      this.chatSvc.conferenceInvite$.subscribe(d => {
        if (!d) return;
        // Don't ring if user is already in this exact call.
        const id = d.callLogId || d.CallLogId;
        if (this.isCallActive && this.currentCallLogId === id) return;
        this.conferenceInvite = d;
        this.callType = (d.callType || d.CallType || 'audio') as 'audio' | 'video';
        this.playRingtone();
      })
    );

    this.subs.push(
      this.chatSvc.conferenceParticipantJoined$.subscribe(d => {
        if (!d) return;
        const eventCallLogId = String(d.callLogId || d.CallLogId || '');
        // Auto-promote: if this is OUR active 1-to-1 call and someone
        // else is joining, we need to switch into conference mode so
        // the new peer's offer gets handled and shown in the grid.
        if (!this.isConference && this.isCallActive &&
            eventCallLogId && eventCallLogId === this.currentCallLogId) {
          this.isConference = true;
          if (this.pc && this.activeCallOtherId) {
            this.peers.set(this.activeCallOtherId, this.pc);
            if (this.remoteStream) {
              this.remoteStreams.set(
                this.activeCallOtherId, this.remoteStream);
            }
            if (!this.participants.has(this.activeCallOtherId)) {
              this.participants.set(this.activeCallOtherId, {
                id: this.activeCallOtherId,
                name: this.activeCall?.name
                  || this.incomingCallData?.callerName
                  || 'Participant'
              });
            }
            this.rebindPeerIce(this.activeCallOtherId, this.pc);
          }
        }
        if (!this.isConference) return;
        const id = String(d.userId || d.UserId);
        const name = String(d.fullName || d.FullName || 'Participant');
        const photo = d.photoUrl || d.PhotoUrl || null;
        this.participants.set(id, { id, name, photoUrl: photo });
        this.bumpConferenceUI();
      })
    );

    this.subs.push(
      this.chatSvc.conferenceParticipantLeft$.subscribe(d => {
        if (!d) return;
        const id = String(d.userId || d.UserId);
        this.removePeer(id);
        this.participants.delete(id);
        this.bumpConferenceUI();
        // If we're left alone in the room, end the call.
        if (this.isConference && this.participants.size === 0) {
          this.endCall(false);
        }
      })
    );

    // Someone in the room offered us a peer connection (they joined late
    // and are now dialing every existing member).
    this.subs.push(
      this.chatSvc.conferenceOffer$.subscribe(async d => {
        if (!d || !this.isConference) return;
        await this.handleConferenceOffer(d);
      })
    );

    this.subs.push(
      this.chatSvc.conferenceAnswer$.subscribe(async d => {
        if (!d) return;
        const fromId = String(d.fromUserId || d.FromUserId);
        const pc = this.peers.get(fromId);
        if (!pc) return;
        try {
          const ans = JSON.parse(d.answer || d.Answer);
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(
              new RTCSessionDescription(ans));
            await this.flushPeerIce(fromId);
          }
        } catch (e) {
          console.error('conferenceAnswer error', e);
        }
      })
    );

    this.subs.push(
      this.chatSvc.conferenceIce$.subscribe(async d => {
        if (!d) return;
        const fromId = String(d.fromUserId || d.FromUserId);
        const pc = this.peers.get(fromId);
        let cand: RTCIceCandidateInit;
        try { cand = JSON.parse(d.candidate || d.Candidate); }
        catch { return; }
        if (!pc || !pc.remoteDescription) {
          const q = this.peerIceQueue.get(fromId) || [];
          q.push(cand);
          this.peerIceQueue.set(fromId, q);
          return;
        }
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); }
        catch {}
      })
    );

    this.subs.push(
      this.chatSvc.callMessage$.subscribe(d => {
        if (!d) return;
        const callId = String(d.callLogId || d.CallLogId || '');
        if (!this.currentCallLogId || callId !== this.currentCallLogId) return;
        const fromId = String(d.fromUserId || d.FromUserId);
        // Skip server echo of our own message (we already added it locally).
        if (this.myUserId && fromId === this.myUserId) return;
        const text = String(d.text || d.Text || '');
        const at = new Date(d.at || d.At || Date.now());
        // Dedupe: same sender + same text within last 3s already shown.
        const key = `${fromId}|${text}|${Math.floor(at.getTime() / 1000)}`;
        if (this._seenMsgKeys.has(key)) return;
        this._seenMsgKeys.add(key);
        if (this._seenMsgKeys.size > 200) {
          // bound the set
          const first = this._seenMsgKeys.values().next().value;
          if (first) this._seenMsgKeys.delete(first);
        }
        this.callMessages.push({
          fromId,
          fromName: String(d.fromName || d.FromName || ''),
          text,
          at,
          mine: false
        });
        this.callChatChanged$.next(this.callMessages.length);
      })
    );
  }

  // ── Popup ────────────────────────────────
  hidePopup() {
    this.isVisible    = false;
    this.incomingCall = null;
    this.stopRingtone();
  }

  // Decline from global popup
  rejectIncomingCall() {
    const callerId = this.incomingCallData?.callerId;
    this.hidePopup();
    this.incomingCallData = null;
    // ✅ incomingCall$ clear karo — dobara popup nahi aayega
    this.chatSvc.incomingCall$.next(null);
    if (callerId) this.chatSvc.rejectCall(callerId);
  }

  // Accept from global popup
  async acceptIncomingCall() {
    if (!this.incomingCallData) return;

    // ✅ TURANT popup hide — async se pehle
    this.isVisible    = false;
    this.incomingCall = null;
    this.stopRingtone();

    // ✅ incomingCall$ clear karo — navigate ke baad dobara popup nahi aayega
    this.chatSvc.incomingCall$.next(null);

    const type = this.incomingCallData.callType || 'audio';
    this.callType = type;

    // Chat page pe navigate — taaki UI ready ho
    if (this._navigateToChat) this._navigateToChat();

    // Thoda wait karo, phir WebRTC answer karo
    setTimeout(() => this.answerCallInternal(), 150);
  }

  // ── WebRTC: Answer ───────────────────────
  async answerCallInternal() {
    if (!this.incomingCallData) return;
    if (this.isCallActive) return;

    this.isSettingRemoteAnswer = false;
    this.iceCandidateQueue     = [];
    this.activeCallOtherId     = this.incomingCallData.callerId;
    // Remember the caller's name so the call window header / roster
    // show "Naresh" instead of the generic "Active Call" fallback.
    this.activeCall = {
      name: this.incomingCallData.callerName || '',
      type: this.callType
    };

    try {
      this.localStream = await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: this.callType === 'video'
        });
      this.attachAudioWatcher(
        this.myUserId || 'me', this.localStream);

      this.pc = this.createPeerConnection();
      this.localStream.getTracks()
        .forEach(t => this.pc!.addTrack(t, this.localStream!));

      const offer = JSON.parse(this.incomingCallData.offer);
      await this.pc.setRemoteDescription(
        new RTCSessionDescription(offer));
      await this.flushIceCandidates();

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await this.chatSvc.acceptCall(
        this.incomingCallData.callerId,
        JSON.stringify(answer));

      this.isCallActive = true;
      this.isMinimized  = false;
      this.callDuration = 0;
      this.rtcState = 'connecting';
      this.startCallTimer();

    } catch (e) {
      console.error('answerCallInternal error:', e);
      this.endCall(false);
    }
  }

  // ── WebRTC: Start outgoing ───────────────
  async startCallInternal(
    receiverId: string,
    type: 'audio' | 'video',
    receiverName: string = ''
  ) {
    if (this.isCallActive) return;
    this.callType          = type;
    this.activeCallOtherId = receiverId;
    // Save the receiver's name so the caller's roster / header show
    // the real person ("Junaid Shaikh"), not the generic "Active Call".
    this.activeCall = { name: receiverName, type };
    this.isSettingRemoteAnswer = false;
    this.iceCandidateQueue     = [];

    try {
      this.localStream = await navigator.mediaDevices
        .getUserMedia({ audio: true, video: type === 'video' });
      this.attachAudioWatcher(
        this.myUserId || 'me', this.localStream);

      this.pc = this.createPeerConnection();
      this.localStream.getTracks()
        .forEach(t => this.pc!.addTrack(t, this.localStream!));

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      await this.chatSvc.initiateCall(
        receiverId, type, JSON.stringify(offer));

    } catch (e) {
      console.error('startCallInternal error:', e);
      this.endCall(false);
    }
  }

  // ── End call ────────────────────────────
  // sendSignal=true: ham end kar rahe hain — hub ko batao
  // sendSignal=false: remote ne end kiya — already notified
  endCall(sendSignal = true) {
    if (this._isEnding) return; // ✅ re-entrant guard
    this._isEnding = true;

    // Conference path: leave the room (server tells other peers).
    if (this.isConference && this.currentCallLogId && sendSignal) {
      this.chatSvc.leaveConference(this.currentCallLogId);
    }
    if (sendSignal && !this.isConference && this.activeCallOtherId) {
      this.chatSvc.endCall(this.activeCallOtherId);
    }

    // Tear down all conference peers.
    this.peers.forEach((pc) => { try { pc.close(); } catch {} });
    this.peers.clear();
    this.remoteStreams.clear();
    this.peerIceQueue.clear();
    this.participants.clear();
    this.isConference = false;
    this.currentCallLogId = null;
    this.callMessages = [];
    this.callChatChanged$.next(0);
    this._seenMsgKeys.clear();
    // Stop every audio level watcher so the mic visualiser doesn't keep
    // running after the call ends.
    this._audioWatchers.forEach(stop => { try { stop(); } catch {} });
    this._audioWatchers.clear();
    this.speakingIds.clear();
    this.speakingChanged$.next(0);
    this.bumpConferenceUI();

    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream  = null;
    this.remoteStream = null;
    this.remoteStream$.next(null);

    if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }

    this.isCallActive          = false;
    this.isMinimized           = false;
    this.activeCall            = null;
    this.callDuration          = 0;
    this.rtcState              = 'closed';
    this.activeCallOtherId     = '';
    this.incomingCallData      = null;
    this.isSettingRemoteAnswer = false;
    this.iceCandidateQueue     = [];
    clearInterval(this.callTimer);
    clearTimeout(this.disconnectTimer);

    // ✅ Streams clear — but callEnded$ null se clear karo
    // Pehle callEnded$ ko null karo taaki subscriber loop nahi hoga
    this.chatSvc.callAccepted$.next(null);
    this.chatSvc.callRejected$.next(null);
    this.chatSvc.iceCandidate$.next(null);
    this.chatSvc.incomingCall$.next(null);
    // callEnded$ last mein — aur sirf ek baar
    if (sendSignal) {
      // Apna khud ka signal — subscribers ko batao
      setTimeout(() => {
        this.chatSvc.callEnded$.next(null);
        this._isEnding = false;
      }, 50);
    } else {
      this.chatSvc.callEnded$.next(null);
      this._isEnding = false;
    }
  }

  // ── Mini bar ────────────────────────────
  showMiniBar(name: string, type: 'audio' | 'video') {
    this.activeCall  = { name, type };
    this.isMinimized = true;
  }

  hideMiniBar() {
    this.isMinimized = false;
  }

  expandCall() {
    this.isMinimized = false;
    this.expandCallRequest$.next(true);
    setTimeout(() => this.expandCallRequest$.next(false), 100);
  }

  endMiniBar() {
    // Mini bar se end — full call end
    this.endCall(true);
  }

  getMiniDuration(): string {
    const m = Math.floor(this.callDuration / 60);
    const s = this.callDuration % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  toggleMute(isMuted: boolean) {
    this.localStream?.getAudioTracks()
      .forEach(t => t.enabled = !isMuted);
  }

  toggleCamera(isCameraOff: boolean) {
    this.localStream?.getVideoTracks()
      .forEach(t => t.enabled = !isCameraOff);
  }

  /**
   * Attach a Web Audio AnalyserNode to a media stream and emit speaking
   * activity for the given userId. RMS averaged over a short window;
   * a small hysteresis avoids flicker. Safe to call multiple times for
   * the same id — the previous watcher is replaced.
   */
  attachAudioWatcher(userId: string, stream: MediaStream | null): void {
    if (!stream || !userId) return;
    // Replace any existing watcher for this id.
    const prev = this._audioWatchers.get(userId);
    if (prev) { try { prev(); } catch {} }

    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;

    let ctx: AudioContext | null = null;
    let raf = 0;
    let lastSpeak = 0;
    try {
      const Ctor = (window as any).AudioContext
        || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const audioCtx: AudioContext = new Ctor();
      ctx = audioCtx;
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS around the 128 baseline.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (rms > 0.04) lastSpeak = now;
        const speaking = (now - lastSpeak) < 350;
        const had = this.speakingIds.has(userId);
        if (speaking && !had) {
          this.speakingIds.add(userId);
          this.speakingChanged$.next(this.speakingChanged$.value + 1);
        } else if (!speaking && had) {
          this.speakingIds.delete(userId);
          this.speakingChanged$.next(this.speakingChanged$.value + 1);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* AudioContext may not be allowed in some contexts */ }

    this._audioWatchers.set(userId, () => {
      cancelAnimationFrame(raf);
      try { ctx?.close(); } catch {}
      this.speakingIds.delete(userId);
      this.speakingChanged$.next(this.speakingChanged$.value + 1);
    });
  }

  // ═════════════════════════════════════════════════════════
  // CONFERENCE / GROUP CALL  (mesh)
  // ═════════════════════════════════════════════════════════

  /** Promote a 1-to-1 to a conference and invite N more users.
   *  Also used to add more people to an existing conference. */
  async inviteParticipants(userIds: string[]) {
    if (!userIds?.length) return;
    if (!this.currentCallLogId || !this.isCallActive) return;

    // First-time promotion: migrate the legacy 1-to-1 PC into the
    // peers map so it sits alongside future peer connections.
    if (!this.isConference) {
      this.isConference = true;
      if (this.pc && this.activeCallOtherId) {
        this.peers.set(this.activeCallOtherId, this.pc);
        if (this.remoteStream) {
          this.remoteStreams.set(
            this.activeCallOtherId, this.remoteStream);
        }
        // Other participant's name will arrive via roster when we ask
        // for the room. For now, register a placeholder so UI shows
        // a tile.
        if (!this.participants.has(this.activeCallOtherId)) {
          this.participants.set(this.activeCallOtherId, {
            id: this.activeCallOtherId,
            name: this.activeCall?.name || 'Participant'
          });
        }
        // Re-bind onicecandidate so it routes via the conference relay
        // instead of the legacy SendIceCandidate.
        this.rebindPeerIce(this.activeCallOtherId, this.pc);
      }
      this.bumpConferenceUI();
    }

    await this.chatSvc.inviteToConference(
      this.currentCallLogId, userIds);
  }

  /** Accept a conference invite popup (we are NOT in a call yet). */
  async acceptConferenceInvite() {
    if (!this.conferenceInvite) return;
    const invite = this.conferenceInvite;
    const callLogId = String(invite.callLogId || invite.CallLogId);
    const callType: 'audio' | 'video' =
      (invite.callType || invite.CallType || 'audio');

    this.conferenceInvite = null;
    this.stopRingtone();

    this.callType = callType;
    this.currentCallLogId = callLogId;
    this.isConference = true;
    this.iceCandidateQueue = [];

    // Navigate to chat so UI is mounted.
    if (this._navigateToChat) this._navigateToChat();

    try {
      this.localStream = await navigator.mediaDevices
        .getUserMedia({
          audio: true, video: callType === 'video'
        });
      this.attachAudioWatcher(
        this.myUserId || 'me', this.localStream);

      const res: any = await this.chatSvc.joinConference(callLogId);
      const existing = (res?.participants ?? res?.Participants ?? []) as any[];

      // Register each existing peer in the roster, then dial them.
      for (const p of existing) {
        const id = String(p.userId || p.UserId);
        const name = String(p.fullName || p.FullName || 'Participant');
        const photo = p.photoUrl || p.PhotoUrl || null;
        this.participants.set(id, { id, name, photoUrl: photo });
        await this.dialPeer(id);
      }
      this.isCallActive = true;
      this.isMinimized  = false;
      this.callDuration = 0;
      this.startCallTimer();
      this.bumpConferenceUI();
    } catch (e) {
      console.error('acceptConferenceInvite error', e);
      this.endCall(true);
    }
  }

  /** Decline a conference invite popup (do not join the room). */
  rejectConferenceInvite() {
    const invite = this.conferenceInvite;
    this.conferenceInvite = null;
    this.stopRingtone();
    if (invite) {
      const callLogId = String(invite.callLogId || invite.CallLogId);
      this.chatSvc.rejectConference(callLogId);
    }
  }

  /** Create a fresh PC to `peerId`, attach local tracks, send offer. */
  private async dialPeer(peerId: string): Promise<void> {
    if (!this.currentCallLogId) return;
    if (this.peers.has(peerId)) return;

    const pc = this.makeConferencePc(peerId);
    this.peers.set(peerId, pc);

    if (this.localStream) {
      this.localStream.getTracks()
        .forEach(t => pc.addTrack(t, this.localStream!));
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.chatSvc.relayConferenceOffer(
        this.currentCallLogId, peerId, JSON.stringify(offer));
    } catch (e) {
      console.error('dialPeer error', e);
      this.removePeer(peerId);
    }
  }

  /** Handle an incoming conference SDP offer from a (possibly new) peer. */
  private async handleConferenceOffer(d: any): Promise<void> {
    const fromId = String(d.fromUserId || d.FromUserId);
    if (!this.currentCallLogId) return;
    // Auto-promote: if we get a conference offer while still in 1-to-1
    // mode for this same call, flip into conference mode and migrate
    // the existing peer connection.
    if (!this.isConference && this.isCallActive) {
      this.isConference = true;
      if (this.pc && this.activeCallOtherId
          && !this.peers.has(this.activeCallOtherId)) {
        this.peers.set(this.activeCallOtherId, this.pc);
        if (this.remoteStream) {
          this.remoteStreams.set(this.activeCallOtherId, this.remoteStream);
        }
        if (!this.participants.has(this.activeCallOtherId)) {
          this.participants.set(this.activeCallOtherId, {
            id: this.activeCallOtherId,
            name: this.activeCall?.name
              || this.incomingCallData?.callerName
              || 'Participant'
          });
        }
        this.rebindPeerIce(this.activeCallOtherId, this.pc);
      }
      this.bumpConferenceUI();
    }
    let pc = this.peers.get(fromId);
    if (!pc) {
      pc = this.makeConferencePc(fromId);
      this.peers.set(fromId, pc);
      if (this.localStream) {
        this.localStream.getTracks()
          .forEach(t => pc!.addTrack(t, this.localStream!));
      }
    }
    try {
      const offer = JSON.parse(d.offer || d.Offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushPeerIce(fromId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.chatSvc.relayConferenceAnswer(
        this.currentCallLogId, fromId, JSON.stringify(answer));
    } catch (e) {
      console.error('handleConferenceOffer error', e);
      this.removePeer(fromId);
    }
  }

  private makeConferencePc(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.currentCallLogId) return;
      this.chatSvc.relayConferenceIce(
        this.currentCallLogId, peerId, JSON.stringify(e.candidate));
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      this.remoteStreams.set(peerId, stream);
      this.attachAudioWatcher(peerId, stream);
      this.bumpConferenceUI();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' ||
          pc.connectionState === 'closed') {
        this.removePeer(peerId);
        this.bumpConferenceUI();
      }
    };
    return pc;
  }

  /** Re-attach the ice handler of a legacy 1-to-1 PC so its candidates
   *  flow through the conference relay path instead. */
  private rebindPeerIce(peerId: string, pc: RTCPeerConnection): void {
    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.currentCallLogId) return;
      this.chatSvc.relayConferenceIce(
        this.currentCallLogId, peerId, JSON.stringify(e.candidate));
    };
  }

  private async flushPeerIce(peerId: string): Promise<void> {
    const pc = this.peers.get(peerId);
    const queue = this.peerIceQueue.get(peerId);
    if (!pc || !queue?.length) return;
    while (queue.length) {
      const c = queue.shift()!;
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }

  private removePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) { try { pc.close(); } catch {} }
    this.peers.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.peerIceQueue.delete(peerId);
  }

  private bumpConferenceUI(): void {
    this.conferenceChanged$.next(
      this.conferenceChanged$.getValue() + 1);
  }

  /** Live participant tiles (id, name, photo, stream). */
  getConferenceTiles(): Array<ConferenceParticipant & {
    stream: MediaStream | null
  }> {
    const list: Array<ConferenceParticipant & {
      stream: MediaStream | null
    }> = [];
    this.participants.forEach((p, id) => {
      list.push({ ...p, stream: this.remoteStreams.get(id) || null });
    });
    return list;
  }

  /** Send an in-call chat message to the room. Also echoes locally so
   *  the sender sees their own message instantly. */
  async sendCallMessage(text: string): Promise<void> {
    const msg = (text || '').trim();
    if (!msg || !this.currentCallLogId) return;
    // Local echo for instant feedback (server will also broadcast back,
    // but we filter dupes by ignoring the echo for `mine`).
    this.callMessages.push({
      fromId: this.myUserId || 'me',
      fromName: 'You',
      text: msg,
      at: new Date(),
      mine: true
    });
    this.callChatChanged$.next(this.callMessages.length);
    try {
      await this.chatSvc.sendCallMessage(this.currentCallLogId, msg);
    } catch (e) {
      console.error('sendCallMessage error', e);
    }
  }

  // ── PeerConnection ───────────────────────
  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.activeCallOtherId) return;
      this.chatSvc.sendIceCandidate(
        this.activeCallOtherId,
        JSON.stringify(e.candidate));
    };

    pc.ontrack = (e) => {
      this.remoteStream = e.streams[0];
      this.remoteStream$.next(this.remoteStream);
      if (this.activeCallOtherId) {
        this.attachAudioWatcher(
          this.activeCallOtherId, this.remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.rtcState = state;

      // Connected again after a short network/tab hiccup.
      if (state === 'connected') {
        clearTimeout(this.disconnectTimer);
        return;
      }

      // Browsers may briefly report disconnected on tab switch/background.
      // End only if it stays disconnected for a grace period.
      if (state === 'disconnected') {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = setTimeout(() => {
          if (this.isCallActive && pc.connectionState === 'disconnected') {
            this.endCall(false);
          }
        }, 15000);
        return;
      }

      if (state === 'failed' || state === 'closed') {
        clearTimeout(this.disconnectTimer);
        if (this.isCallActive) this.endCall(false);
      }
    };

    return pc;
  }

  private async flushIceCandidates() {
    if (!this.pc) return;
    while (this.iceCandidateQueue.length) {
      const c = this.iceCandidateQueue.shift()!;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
  }

  private startCallTimer() {
    clearInterval(this.callTimer);
    this.callTimer = setInterval(() => this.callDuration++, 1000);
  }

  private playRingtone() {
    try {
      this.stopRingtone();
      const ctx = new AudioContext();
      let stopped = false;
      const beep = () => {
        if (stopped) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 440; o.type = 'sine';
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
        if (!stopped) setTimeout(beep, 1200);
      };
      beep();
      this._stopRingFn = () => { stopped = true; try { ctx.close(); } catch {} };
    } catch {}
  }

  private stopRingtone() {
    if (this._stopRingFn) { this._stopRingFn(); this._stopRingFn = null; }
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.stopRingtone();
    clearInterval(this.callTimer);
    clearTimeout(this.disconnectTimer);
  }
}
