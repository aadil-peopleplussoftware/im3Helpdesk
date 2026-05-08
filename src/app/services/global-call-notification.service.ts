// ✅ FILE: src/app/services/global-call-notification.service.ts
// Root service — WebRTC yahan hai, tab/page change pe alive rahega

import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ChatService } from './chat.service';

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

  // ── WebRTC (yahan store — never destroyed) ──
  pc: RTCPeerConnection | null     = null;
  localStream: MediaStream | null  = null;
  remoteStream: MediaStream | null = null;
  iceCandidateQueue: RTCIceCandidateInit[] = [];
  isSettingRemoteAnswer = false;
  incomingCallData: any = null;
  activeCallOtherId     = '';

  // ── Streams ──────────────────────────────
  expandCallRequest$ = new BehaviorSubject<boolean>(false);
  remoteStream$      = new BehaviorSubject<MediaStream | null>(null);

  private callTimer: any;
  private _stopRingFn: (() => void) | null = null;
  private _navigateToChat: (() => void) | null = null;

  // ── Flag: prevent re-entrant endCall ────
  private _isEnding = false;

  // ─────────────────────────────────────────
  init(navigateToChatFn: () => void) {
    this._navigateToChat = navigateToChatFn;

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
        this.playRingtone();
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

    try {
      this.localStream = await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: this.callType === 'video'
        });

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
      this.startCallTimer();

    } catch (e) {
      console.error('answerCallInternal error:', e);
      this.endCall(false);
    }
  }

  // ── WebRTC: Start outgoing ───────────────
  async startCallInternal(receiverId: string, type: 'audio' | 'video') {
    if (this.isCallActive) return;
    this.callType          = type;
    this.activeCallOtherId = receiverId;
    this.isSettingRemoteAnswer = false;
    this.iceCandidateQueue     = [];

    try {
      this.localStream = await navigator.mediaDevices
        .getUserMedia({ audio: true, video: type === 'video' });

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

    if (sendSignal && this.activeCallOtherId) {
      this.chatSvc.endCall(this.activeCallOtherId);
    }

    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream  = null;
    this.remoteStream = null;
    this.remoteStream$.next(null);

    if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }

    this.isCallActive          = false;
    this.isMinimized           = false;
    this.activeCall            = null;
    this.callDuration          = 0;
    this.activeCallOtherId     = '';
    this.incomingCallData      = null;
    this.isSettingRemoteAnswer = false;
    this.iceCandidateQueue     = [];
    clearInterval(this.callTimer);

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
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed') {
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
  }
}