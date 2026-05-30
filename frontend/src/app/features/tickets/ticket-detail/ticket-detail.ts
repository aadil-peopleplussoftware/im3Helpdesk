import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ChangeDetectorRef, inject,
  ViewChild, ElementRef,
  ChangeDetectionStrategy, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule,
  FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule }
  from '@angular/router';
import { MatProgressSpinnerModule }
  from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { Subject, interval, forkJoin, of } from 'rxjs';
import { takeUntil, catchError, map, distinctUntilChanged } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { TicketService } from '../../../core/services/ticket';
import { AgentService } from '../../../core/services/agent';
import { AgentGroupService }
  from '../../../core/services/agent-group';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../../environments/environment';
import { TicketMasterOption, TicketMasterService } from '../../../core/services/ticket-master';
import { TopbarContextService } from '../../../core/services/topbar-context.service';
import { OrgContextService } from '../../../core/services/org-context.service';
import { ReactionBarComponent } from '../../../shared/components/reaction-bar/reaction-bar';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [
    CommonModule, FormsModule,
    ReactiveFormsModule, RouterModule,
    MatProgressSpinnerModule,
    LayoutComponent,
    ReactionBarComponent,
    HasPermissionDirective
  ],
  templateUrl: './ticket-detail.html',
  styleUrls: ['./ticket-detail.scss']
})
export class TicketDetailComponent
  implements OnInit, AfterViewInit, OnDestroy {

  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private ticketService = inject(TicketService);
  private agentService = inject(AgentService);
  readonly baseUrl = environment.baseUrl;
  private agentGroupService =
    inject(AgentGroupService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();
  private sanitizer = inject(DomSanitizer);
  private ticketMasterService = inject(TicketMasterService);
  private topbarCtx = inject(TopbarContextService);
  private orgContext = inject(OrgContextService);

  /** Project-wide IANA timezone used for all template date formatting. */
  get tz(): string {
    return this.orgContext.timezone();
  }

  canDeleteTicket(): boolean {
    const role = this.authService.getUserRole();
    return role === 'CompanyAdmin' || role === 'SuperAdmin';
  }

  private runUiUpdate(fn: () => void) {
    setTimeout(() => {
      fn();
      this.cdr.detectChanges();
    }, 0);
  }

  @ViewChild('replyEditor')
    replyEditorRef!: ElementRef;
  @ViewChild('noteEditor')
    noteEditorRef!: ElementRef;
  @ViewChild('forwardEditor')
    forwardEditorRef!: ElementRef;

  // ─── State ───────────────────────────
  ticket: any = null;
  loading = true;
  updating = false;
  forwarding = false;
  agents: any[] = [];
  groups: any[] = [];
  ticketId = '';
  isAgent = false;

  /**
   * trackBy helpers — keep `*ngFor` DOM stable across polling refreshes
   * so embedded <audio>/<img>/iframes don't get torn down + re-fetched
   * every 15 seconds (which caused the visible "blink").
   */
  trackById = (_: number, item: any): any =>
    item?.id ?? item?.fileUrl ?? item?.createdAt ?? _;
  trackByValue = (_: number, item: any): any =>
    item?.value ?? item?.id ?? item;

  // ─── Composer ────────────────────────
  // ✅ single variable controls tabs
  activeComposerTab:
    'reply' | 'note' | 'forward' = 'note';

  /** Composer starts collapsed (small one-line input). Expands on click. */
  composerExpanded = false;

  /** Conversation thread collapse (Freshdesk-style "+N conversations" pill). */
  convoExpanded = false;

  quickReplyText = '';
  noteText = '';
  noteIsPrivate = true;
  noteVisOpen = false;
  forwardEmail = '';
  forwardText = '';
  pendingFiles: File[] = [];
  attachments: any[] = [];

  // ── Reply Cc / Bcc ──────────────────
  showCc = false;
  showBcc = false;
  replyCc: string[] = [];
  replyBcc: string[] = [];
  ccInput = '';
  bccInput = '';

  // ── Forward Cc / Bcc + prefill ────────────
  showFwdCc = false;
  showFwdBcc = false;
  fwdCc: string[] = [];
  fwdBcc: string[] = [];
  fwdCcInput = '';
  fwdBccInput = '';
  forwardPrefillHtml = '';

  // ─── Notify ──────────────────────────
  notifyTo = '';
  notifyAgents: any[] = [];
  mentionResults: any[] = [];

  // ─── Props ───────────────────────────
  selectedAgentId = '';
  selectedGroupId = '';
  newTag = '';

  // ─── Org / Signature ─────────────────
  orgSupportEmail = '';  orgSupportName = '';  agentSignature = '';

  // ─── Custom Fields ───────────────────
  customFields: any[] = [];
  customFieldValues: { [key: string]: any } = {};

  // ─── Viewers / Timeline ──────────────
  viewers: any[] = [];
  watchers: any[] = [];
  watcherPopoverOpen = false;
  watcherQuery = '';
  watcherBusyUserId: string | null = null;
  watcherLoading = false;
  private _viewersRef: any[] | null = null;
  private _viewersCache: any[] = [];
  private _recentViewersCount = 0;
  timeline: any[] = [];
  showTimeline = true;

  statuses: TicketMasterOption[] = [];
  priorities: TicketMasterOption[] = [];
  ticketTypes: TicketMasterOption[] = [];

  // ─── Top toolbar UI state ────────────
  starred = false;
  rightRailHidden = false;
  activityPanelOpen = false;
  viewerPopoverOpen = false;

  toggleStar(ev?: Event) {
    ev?.stopPropagation();
    this.runUiUpdate(() => {
      this.watcherPopoverOpen = !this.watcherPopoverOpen;
      this.viewerPopoverOpen = false;
    });
  }
  toggleRightRail() { this.rightRailHidden = !this.rightRailHidden; }
  toggleActivityPanel() { this.activityPanelOpen = !this.activityPanelOpen; }

  goBackToList() { this.router.navigate(['/tickets']); }

  focusComposerTab(tab: 'reply' | 'note' | 'forward') {
    this.activeComposerTab = tab;
    this.composerExpanded = true;
    setTimeout(() => {
      const el = document.querySelector('.fd-composer');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  scrollToActivities() {
    this.activityPanelOpen = true;
  }

  closeTicketQuick() {
    const closed = this.statuses.find(s =>
      (s.value || '').toLowerCase() === 'closed')?.value || 'Closed';
    this.updateStatus(closed);
  }

  // ─────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────
  private showToast(
    type: 'success' | 'error' | 'info',
    msg: string) {
    Promise.resolve().then(() => {
      if (type === 'success')
        this.toastr.success(msg);
      else if (type === 'error')
        this.toastr.error(msg);
      else this.toastr.info(msg);
    });
  }

  sanitizeHtml(html: string): SafeHtml {
    if (!html) return '';
    // Email bodies are sanitised server-side by HtmlSanitizer (Ganss.Xss)
    // with a permissive style allow-list so highlights / colors / fonts
    // round-trip back. Angular's built-in sanitiser strips inline `style`
    // attributes and would erase that formatting — so we trust the
    // server-cleaned HTML here.
    // Inline images extracted from inbound email are stored as
    // `src="/uploads/<guid>.<ext>"` (server-relative). The Angular dev
    // server doesn't proxy /uploads, so resolve them against the API
    // host so they actually load in the browser.
    let fixed = String(html).replace(
      /(src|href)\s*=\s*(["'])\/uploads\//gi,
      (_m, attr, q) => `${attr}=${q}${environment.baseUrl}/uploads/`
    );
    // Make inline body images click-to-open (Freshdesk-style): tag every
    // <img> that points at /uploads with a marker class + zoom cursor;
    // the host <div> click handler opens the full image in a new tab.
    fixed = fixed.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']*\/uploads\/[^"']+)\2([^>]*)>/gi,
      (_m, pre, q, url, post) =>
        `<img${pre}src=${q}${url}${q}${post} class="email-inline-img" style="cursor:zoom-in;max-width:100%;" data-zoom-src="${url}">`
    );
    return this.sanitizer.bypassSecurityTrustHtml(fixed);
  }

  /** Click handler bound on every `[innerHTML]` body — opens inline
   *  email images in a new tab when the user clicks them. */
  onBodyClick(ev: Event) {
    const t = ev.target as HTMLElement | null;
    if (!t || t.tagName !== 'IMG') return;
    const src = (t as HTMLImageElement).getAttribute('data-zoom-src') ||
      (t as HTMLImageElement).src;
    if (!src) return;
    ev.preventDefault();
    window.open(src, '_blank', 'noopener,noreferrer');
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    return colors[
      (name?.charCodeAt(0) || 0) % colors.length];
  }

  /** Returns up to 2 uppercase initials (e.g. "Aadil Khan" => "AK"). */
  getInitials(name?: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.charAt(0) || '';
    const second = parts.length > 1
      ? parts[parts.length - 1].charAt(0) : '';
    return (first + second).toUpperCase();
  }

  /**
   * Display name for the ticket creator.
   * Priority:
   *  1. Registered user (UI-submitted ticket) → CreatedBy.FullName
   *  2. Email-originated ticket → FromName captured at polling time
   *  3. Fallback → local part of FromEmail
   */
  senderName(): string {
    const t: any = this.ticket;
    if (!t) return '';
    return (
      t.createdBy?.fullName ||
      t.fromName ||
      (t.fromEmail ? String(t.fromEmail).split('@')[0] : '') ||
      'Unknown'
    );
  }

  /** Email address of the ticket creator (registered user OR email sender). */
  senderEmail(): string {
    const t: any = this.ticket;
    return t?.fromEmail || t?.createdBy?.email || '';
  }

  /**
   * Display name for a comment author.
   * Handles three sources:
   *  - Registered user (UI reply / note) -> comment.user.fullName
   *  - Inbound email reply (no user)     -> comment.fromName
   *  - Last-ditch fallback                -> local part of fromEmail
   */
  commentAuthor(c: any): string {
    if (!c) return '';
    return (
      c.user?.fullName ||
      c.fromName ||
      (c.fromEmail ? String(c.fromEmail).split('@')[0] : '') ||
      'Unknown'
    );
  }

  /** Sender email for a comment (registered user, inbound, or empty). */
  commentEmail(c: any): string {
    if (!c) return '';
    return c.user?.email || c.fromEmail || '';
  }

  /** True when the ticket was opened via inbound email (no creator user). */
  isEmailTicket(): boolean {
    const t: any = this.ticket;
    if (!t) return false;
    return !!t.fromEmail || !!t.inboundMessageId || !t.createdBy;
  }

  /**
   * Navigate to the Contacts page filtered for the supplied identifier.
   * Prefers the email so we land on the matching contact card directly.
   */
  openContact(emailOrName: string | null | undefined) {
    const q = (emailOrName || '').trim();
    if (!q) return;
    this.router.navigate(['/contacts'], { queryParams: { q } });
  }

  // ─── Viewer badge helpers ────────────────────────────────
  /** Unique viewers by userId (fallback userName) so multiple visits collapse.
   *  Filters to the last 1 hour and excludes the currently signed-in user. */
  uniqueViewers(): any[] {
    // Cache against the viewers array reference so successive change-detection
    // passes return identical output (avoids NG0100 caused by Date.now() drift).
    if (this._viewersRef === this.viewers) return this._viewersCache;
    const seen = new Set<string>();
    const out: any[] = [];
    const cutoff = Date.now() - 60 * 60 * 1000; // last 1 hour
    const recentCutoff = Date.now() - 5 * 60 * 1000; // last 5 min
    let recentCount = 0;
    const me = (this.authService.getUserName() || '').trim().toLowerCase();
    for (const v of this.viewers || []) {
      const at = v?.viewedAt ? new Date(v.viewedAt).getTime() : 0;
      if (!at || at < cutoff) continue;
      const name = String(v?.userName ?? '').trim().toLowerCase();
      if (me && name === me) continue;
      const key = String(v?.userId ?? name).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const isRecent = at >= recentCutoff;
      if (isRecent) recentCount++;
      out.push({ ...v, isRecent });
    }
    this._viewersRef = this.viewers;
    this._viewersCache = out;
    this._recentViewersCount = recentCount;
    return out;
  }

  recentViewersCount(): number {
    this.uniqueViewers();
    return this._recentViewersCount;
  }

  uniqueViewerNames(): string {
    return this.uniqueViewers()
      .map(v => v?.userName || 'Unknown')
      .join('\n');
  }

  uniqueViewerDetails(): string {
    return this.uniqueViewers()
      .map(v => {
        const name = v?.userName || 'Unknown';
        const when = this.timeAgo(v?.viewedAt);
        const email = v?.email || v?.userEmail || '';
        return email
          ? `${name} (${email}) - ${when}`
          : `${name} - ${when}`;
      })
      .join('\n');
  }

  openViewerContact(v: any, ev?: Event): void {
    ev?.stopPropagation();
    const q = (v?.email || v?.userEmail || v?.userName || '').trim();
    if (!q) return;
    this.openContact(q);
  }

  toggleViewerPopover(ev?: Event): void {
    ev?.stopPropagation();
    this.runUiUpdate(() => {
      this.viewerPopoverOpen = !this.viewerPopoverOpen;
      this.watcherPopoverOpen = false;
    });
  }

  openViewerPopover(ev?: Event): void {
    ev?.stopPropagation();
    this.runUiUpdate(() => {
      this.viewerPopoverOpen = true;
      this.watcherPopoverOpen = false;
    });
  }

  closeViewerPopover(): void {
    this.viewerPopoverOpen = false;
  }

  private decodeTokenPayload(): any | null {
    const token = this.authService.getToken();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const normalized = payload
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  private currentUserId(): string {
    const p = this.decodeTokenPayload() || {};
    return String(
      p.nameid ||
      p.sub ||
      p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] ||
      ''
    );
  }

  private currentUserEmail(): string {
    const p = this.decodeTokenPayload() || {};
    return String(
      p.email ||
      p.upn ||
      p.unique_name ||
      ''
    );
  }

  private upsertLocalWatcher(w: any): void {
    const id = String(w?.userId || '').toLowerCase();
    if (!id) return;
    const idx = this.watchers.findIndex(x =>
      String(x?.userId || '').toLowerCase() === id);
    if (idx >= 0) this.watchers[idx] = { ...this.watchers[idx], ...w };
    else this.watchers = [...this.watchers, w];
    this.starred = this.hasAnyWatcher();
  }

  private removeLocalWatcher(userId: string): void {
    const id = String(userId || '').toLowerCase();
    this.watchers = (this.watchers || []).filter(w =>
      String(w?.userId || '').toLowerCase() !== id);
    this.starred = this.hasAnyWatcher();
  }

  hasAnyWatcher(): boolean {
    return (this.watchers?.length || 0) > 0;
  }

  isMeWatcher(): boolean {
    const me = this.currentUserId().toLowerCase();
    if (!me) return false;
    return this.watchers.some(w => String(w?.userId || '').toLowerCase() === me);
  }

  watcherCandidates(): any[] {
    const query = (this.watcherQuery || '').trim().toLowerCase();
    const watched = new Set(
      (this.watchers || []).map(w => String(w?.userId || '').toLowerCase())
    );
    return (this.agents || [])
      .filter(a => {
        const id = String(a?.id || '').toLowerCase();
        if (!id || watched.has(id)) return false;
        if (!query) return true;
        const name = String(a?.fullName || '').toLowerCase();
        const email = String(a?.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      })
      .slice(0, 8);
  }

  addMeWatcher(ev?: Event): void {
    ev?.stopPropagation();
    if (!this.ticketId || this.watcherBusyUserId) return;
    this.watcherBusyUserId = 'me';
    this.ticketService.addMeWatcher(this.ticketId).subscribe({
      next: () => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.upsertLocalWatcher({
            userId: this.currentUserId(),
            fullName: this.authService.getUserName() || 'You',
            email: this.currentUserEmail(),
            createdAt: new Date().toISOString()
          });
        });
        this.loadWatchers();
      },
      error: (err) => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.showToast('error', err?.error?.message || 'Failed to add watcher');
        });
      }
    });
  }

  addWatcherById(userId: string, ev?: Event): void {
    ev?.stopPropagation();
    if (!userId || this.watcherBusyUserId) return;
    this.watcherBusyUserId = userId;
    const agent = (this.agents || []).find(a =>
      String(a?.id || '').toLowerCase() === String(userId).toLowerCase());
    this.ticketService.addWatcher(this.ticketId, userId).subscribe({
      next: () => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.watcherQuery = '';
          this.upsertLocalWatcher({
            userId,
            fullName: agent?.fullName || 'Watcher',
            email: agent?.email || '',
            photoUrl: agent?.photoUrl,
            createdAt: new Date().toISOString()
          });
        });
        this.loadWatchers();
      },
      error: (err) => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.showToast('error', err?.error?.message || 'Failed to add watcher');
        });
      }
    });
  }

  removeWatcherById(userId: string, ev?: Event): void {
    ev?.stopPropagation();
    if (!userId || this.watcherBusyUserId) return;
    this.watcherBusyUserId = userId;
    this.ticketService.removeWatcher(this.ticketId, userId).subscribe({
      next: () => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.removeLocalWatcher(userId);
        });
        this.loadWatchers();
      },
      error: (err) => {
        this.runUiUpdate(() => {
          this.watcherBusyUserId = null;
          this.showToast('error', err?.error?.message || 'Failed to remove watcher');
        });
      }
    });
  }

  /** "11 days ago", "3 hours ago", "just now".
   *  Pinned to a 30-second bucket so successive change-detection
   *  passes return the same string (avoids NG0100). */
  timeAgo(value: string | Date | null | undefined): string {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const bucket = Math.floor(Date.now() / 30000) * 30000;
    const diff = Math.max(0, bucket - then);
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60)
      return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
      return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const d = Math.floor(hr / 24);
    if (d === 1) return 'a day ago';
    if (d < 30) return `${d} days ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12)
      return `${mo} month${mo === 1 ? '' : 's'} ago`;
    const yr = Math.floor(d / 365);
    return `${yr} year${yr === 1 ? '' : 's'} ago`;
  }

  /** Returns parsed Notified-To recipients for a note comment. */
  getNotifiedList(c: any): string[] {
    if (!c?.notifiedTo) return [];
    return String(c.notifiedTo)
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }

  /** Comma-separated email field → trimmed unique list. */
  private splitEmails(raw: any): string[] {
    if (!raw) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    String(raw).split(',').forEach(p => {
      const e = p.trim();
      if (!e) return;
      const k = e.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(e);
    });
    return out;
  }
  getCcList(c: any): string[] { return this.splitEmails(c?.cc); }
  getBccList(c: any): string[] { return this.splitEmails(c?.bcc); }
  getTicketCcList(): string[] {
    return this.ticket ? this.splitEmails(this.ticket.ccEmails) : [];
  }
  getTicketBccList(): string[] {
    return this.ticket ? this.splitEmails(this.ticket.bccEmails) : [];
  }
  /**
   * "To:" line for an agent reply / outbound comment — addressed back to the
   * ticket sender. For inbound replies (customer email) we show the org
   * support address instead.
   */
  getReplyToList(c: any): string[] {
    if (!c) return [];
    // Forward → "To" is the external recipient stored in notifiedTo.
    if (c.source === 'forward') {
      return this.getNotifiedList(c);
    }
    // Inbound email from the customer side → goes to our support address.
    if (c.source === 'email' && !c.user?.isAgent) {
      return this.orgSupportEmail ? [this.orgSupportEmail] : [];
    }
    // Agent outbound → addressed back to the ticket sender.
    const to = this.ticket?.fromEmail;
    return to ? [to] : [];
  }


  /** Note edit/delete are allowed only within 1 hour of creation.
   *  Result is bucketed to a 5-second window so two CD passes within
   *  the same change-detection tick always return the same value
   *  (avoids NG0100). */
  private _editableCache = new Map<string, { until: number; ok: boolean }>();
  canEditNote(c: any): boolean {
    if (!c?.isInternal || !this.isAgent) return false;
    const created = c?.createdAt ? new Date(c.createdAt).getTime() : 0;
    if (!created) return false;
    const id = c?.id as string | undefined;
    if (!id) return Date.now() - created < 60 * 60 * 1000;
    const cached = this._editableCache.get(id);
    const now = Date.now();
    if (cached && now < cached.until) return cached.ok;
    const ok = now - created < 60 * 60 * 1000;
    this._editableCache.set(id, { until: now + 5000, ok });
    return ok;
  }

  // ─── Note kebab menu + inline edit (Freshdesk-style) ───
  noteMenuOpenId: string | null = null;
  editingNoteId: string | null = null;
  editingNoteText = '';
  savingNoteId: string | null = null;
  deletingNoteId: string | null = null;

  toggleNoteMenu(c: any, ev?: Event) {
    ev?.stopPropagation();
    this.noteMenuOpenId = this.noteMenuOpenId === c.id ? null : c.id;
  }

  closeNoteMenu() { this.noteMenuOpenId = null; }

  @HostListener('document:click', ['$event'])
  onDocClick(_ev?: MouseEvent) {
    if (!this.noteMenuOpenId && !this.viewerPopoverOpen && !this.watcherPopoverOpen) return;
    this.runUiUpdate(() => {
      this.noteMenuOpenId = null;
      this.viewerPopoverOpen = false;
      this.watcherPopoverOpen = false;
    });
  }

  startEditNote(c: any, ev?: Event) {
    ev?.stopPropagation();
    if (!this.canEditNote(c)) return;
    const html = String(c.comment || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');
    // Decode HTML entities (&nbsp;, &amp;, &lt; …) using a DOM textarea.
    const ta = document.createElement('textarea');
    ta.innerHTML = html;
    const text = (ta.value || '')
      .replace(/\u00a0/g, ' ')
      .trim();
    this.runUiUpdate(() => {
      this.noteMenuOpenId = null;
      this.editingNoteId = c.id;
      this.editingNoteText = text;
    });
  }

  cancelNoteEdit() {
    this.runUiUpdate(() => {
      this.editingNoteId = null;
      this.editingNoteText = '';
    });
  }

  saveNoteEdit(c: any) {
    if (!this.canEditNote(c)) return;
    if (this.savingNoteId) return;
    const trimmed = (this.editingNoteText || '').trim();
    if (!trimmed) return;
    const html = trimmed.replace(/\r\n|\r|\n/g, '<br>');

    this.runUiUpdate(() => {
      this.savingNoteId = c.id;
    });
    this.ticketService.updateComment(
      this.ticketId,
      c.id,
      { comment: html, isInternal: true }
    ).subscribe({
      next: () => {
        this.runUiUpdate(() => {
          c.comment = html;
          this.editingNoteId = null;
          this.editingNoteText = '';
          this.savingNoteId = null;
          this.showToast('success', 'Note updated');
        });
      },
      error: (err) => {
        this.runUiUpdate(() => {
          this.savingNoteId = null;
          this.showToast('error',
            err?.error?.message || 'Failed to update note');
        });
      }
    });
  }

  /** Inline edit of a private note (within 1 hour). */
  editNote(c: any) {
    this.startEditNote(c);
  }

  /** Delete a private note (within 1 hour). */
  deleteNote(c: any) {
    if (!this.canEditNote(c)) return;
    if (this.deletingNoteId) return;
    if (!window.confirm('Delete this private note? This cannot be undone.')) return;

    this.runUiUpdate(() => {
      this.noteMenuOpenId = null;
      this.deletingNoteId = c.id;
    });
    this.ticketService.deleteComment(this.ticketId, c.id).subscribe({
      next: () => {
        this.runUiUpdate(() => {
          this.ticket.comments =
            (this.ticket.comments || []).filter((x: any) => x.id !== c.id);
          this.deletingNoteId = null;
          this.showToast('success', 'Note deleted');
        });
      },
      error: (err) => {
        this.runUiUpdate(() => {
          this.deletingNoteId = null;
          this.showToast('error',
            err?.error?.message || 'Failed to delete note');
        });
      }
    });
  }

  getTagsArray(): string[] {
    if (!this.ticket?.tags) return [];
    return this.ticket.tags
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);
  }

  getCommentAttachments(commentId: string): any[] {
    if (!this.attachments) return [];
    // Memoise per-comment slice. Without this, every change-detection
    // pass returns a brand-new array → embedded <audio>/<img> elements
    // get re-created → audible/visible blink during the 15s polling.
    const cache = this._commentAttCache;
    if (cache.ref === this.attachments && cache.map.has(commentId)) {
      return cache.map.get(commentId)!;
    }
    if (cache.ref !== this.attachments) {
      cache.ref = this.attachments;
      cache.map.clear();
    }
    const slice = this.attachments.filter(
      a => a.commentId === commentId);
    cache.map.set(commentId, slice);
    return slice;
  }
  private _commentAttCache: {
    ref: any[] | null; map: Map<string, any[]>;
  } = { ref: null, map: new Map() };

  getTicketAttachments(): any[] {
    if (!this.attachments) return [];
    if (this._ticketAttRef === this.attachments) return this._ticketAttCache;
    this._ticketAttRef = this.attachments;
    this._ticketAttCache = this.attachments.filter(a => !a.commentId);
    return this._ticketAttCache;
  }
  private _ticketAttRef: any[] | null = null;
  private _ticketAttCache: any[] = [];

  getFileIcon(type: string): string {
    if (type?.startsWith('image/')) return '🖼';
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('word')) return '📝';
    if (type?.includes('excel') ||
        type?.includes('sheet')) return '📊';
    if (type?.includes('zip')) return '🗜';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576)
      return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  // ── Conversation collapse (Freshdesk-style) ──
  /** When collapsed, show only the last 2 comments; rest hide behind a pill. */
  private readonly CONVO_TAIL_COUNT = 2;

  get visibleComments(): any[] {
    const all = this.ticket?.comments || [];
    if (this.convoExpanded || all.length <= this.CONVO_TAIL_COUNT + 1) return all;
    return all.slice(-this.CONVO_TAIL_COUNT);
  }

  get hiddenConversationsCount(): number {
    const all = this.ticket?.comments || [];
    if (this.convoExpanded || all.length <= this.CONVO_TAIL_COUNT + 1) return 0;
    return all.length - this.CONVO_TAIL_COUNT;
  }

  expandConversations() {
    this.convoExpanded = true;
  }

  getTimelineLabel(action: string): string {
    const m: any = {
      'Created': 'created this ticket',
      'StatusChanged': 'changed status',
      'Assigned': 'assigned ticket',
      'Commented': 'added a reply',
      'NoteAdded': 'added a note',
      'Updated': 'updated ticket',
      'TagAdded': 'added a tag',
      'PriorityChanged': 'changed priority',
      'GroupChanged': 'changed group',
      'TimeLogged': 'logged time'
    };
    return m[action] || action?.toLowerCase() || '';
  }

  // ─────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────
  ngOnInit() {
    const role = this.authService.getUserRole();
    this.isAgent = ['Agent', 'CompanyAdmin', 'SuperAdmin'].includes(role);

    // Non-critical / lazy data — safe to fire-and-forget alongside the bundle.
    this.loadMasterOptions();
    this.loadAgents();
    this.loadGroups();
    this.loadAgentSignature();

    this.route.paramMap
      .pipe(
        map(params => params.get('id') || ''),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((id) => {
        if (!id) {
          this.router.navigate(['/tickets']);
          return;
        }

        this.ticketId = id;
        this.convoExpanded = false;
        this.ticket = null;
        this.attachments = [];
        this.timeline = [];
        this.viewers = [];
        this.watchers = [];
        this._ticketJson = null;
        this._attachmentsSig = null;
        this.setLoading(true);

        // Atomic initial load: render page only after core ticket payload resolves.
        this.loadInitialBundleAtomic();
        this.loadCustomFieldValues();
      });
  }

  /**
   * Fetch ticket + org-info + attachments + timeline + viewers in parallel
   * and only flip `loading = false` once they all resolve. This eliminates
   * the visible jitter where To:/Cc: rows appear seconds after the rest.
   */
  private loadInitialBundleAtomic(): void {
    const safe = <T>(src: any, fallback: T) =>
      src.pipe(catchError(() => of(fallback)));

    const ticket$ = this.ticketService.getById(this.ticketId);
    const org$ = this.http.get<any>(
      `${environment.apiUrl}/Organizations/current`);
    const attachments$ = this.http.get<any[]>(
      `${environment.apiUrl}/Attachments/ticket/${this.ticketId}`);
    const timeline$ = this.http.get<any[]>(
      `${environment.apiUrl}/Tickets/${this.ticketId}/timeline`);
    const viewers$ = this.http.get<any[]>(
      `${environment.apiUrl}/Tickets/${this.ticketId}/viewers`);
    const watchers$ = this.ticketService.getWatchers(this.ticketId);

    forkJoin({
      ticket: safe(ticket$, null),
      org: safe(org$, null),
      attachments: safe(attachments$, [] as any[]),
      timeline: safe(timeline$, [] as any[]),
      viewers: safe(viewers$, [] as any[]),
      watchers: safe(watchers$, [] as any[])
    }).subscribe({
      next: (bundle: any) => {
        const { ticket, org, attachments, timeline, viewers, watchers } = bundle;
        if (!ticket) {
          this.setLoading(false);
          this.router.navigate(['/tickets']);
          return;
        }

        // Hydrate org first so any *ngIf="orgSupportEmail" gates pass
        // BEFORE the conversation renders on the next change-detection.
        if (org) {
          this.orgSupportEmail = org.smtpFromEmail || org.supportEmail || '';
          this.orgSupportName = org.smtpFromName || org.name || 'iM3 Support';
        }

        this.ticket = ticket;
        if (ticket.assignedTo?.id)
          this.selectedAgentId = ticket.assignedTo.id;
        if (ticket.agentGroup?.id)
          this.selectedGroupId = ticket.agentGroup.id;

        this.attachments = attachments || [];
        this.timeline = timeline || [];
        this.viewers = viewers || [];
        this.watchers = watchers || [];
        this.starred = this.hasAnyWatcher();

        if (ticket?.ticketNumber)
          this.topbarCtx.set('#TN' + ticket.ticketNumber);

        this.refreshForwardPrefill();
        this.prefillReplyCcFromTicket();

        this.setLoading(false);
        this.recordView();
      },
      error: () => this.setLoading(false)
    });
  }

  loadMasterOptions() {
    this.ticketMasterService.getAll(true).subscribe({
      next: (data) => {
        // Defer to next macrotask so the assignment never lands inside
        // an in-flight CD pass (avoids NG0100 when the response races
        // with the initial sibling-component bootstrap tick).
        setTimeout(() => {
          this.ticketTypes = data.ticketTypes || [];
          this.statuses = data.ticketStatuses || [];
          this.priorities = data.ticketPriorities || [];
          this.cdr.markForCheck();
        }, 0);
      }
    });
  }

  ngAfterViewInit() {
    // Atomic bundle already hydrated orgInfo; just kick off the
    // background refresh loop here so the very first render is clean.
    setTimeout(() => this.startPolling(), 0);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.topbarCtx.clear();
  }

  startPolling() {
    interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadTicket();
        this.loadAttachments();
        this.recordView();
      });
    this.recordView();
  }

  // ─────────────────────────────────────
  // DATA LOAD
  // ─────────────────────────────────────
loadTicket() {
  this.ticketService.getById(this.ticketId)
    .subscribe({
      next: (data: any) => {
        // Avoid replacing the ticket object reference on every poll
        // if nothing actually changed — that keeps Angular CD stable
        // and prevents flicker on embedded audio / images.
        const prevJson = this._ticketJson;
        const nextJson = JSON.stringify(data);
        if (prevJson !== nextJson) {
          this.ticket = data;
          this._ticketJson = nextJson;
        }
        this.setLoading(false);

        if (data.assignedTo?.id)
          this.selectedAgentId = data.assignedTo.id;
        if (data.agentGroup?.id)
          this.selectedGroupId = data.agentGroup.id;
        this.loadViewers();
        this.loadWatchers();
        this.refreshForwardPrefill();
        this.prefillReplyCcFromTicket();
        // Surface ticket number as a topbar breadcrumb suffix
        // (e.g. "Tickets › #TN1007") while this detail page is open.
        if (data?.ticketNumber)
          this.topbarCtx.set('#TN' + data.ticketNumber);
      },
      error: (err) => {
        this.setLoading(false);
        if (err.status === 404)
          this.router.navigate(['/tickets']);
      }
    });
}
  private _ticketJson: string | null = null;

  private setLoading(value: boolean) {
    queueMicrotask(() => {
      this.loading = value;
      this.cdr.detectChanges();
    });
  }

  loadAttachments() {
    this.http.get<any[]>(
      `${environment.apiUrl}/Attachments` +
      `/ticket/${this.ticketId}`
    ).subscribe({
      next: (data) => {
        // Only swap reference when the set actually changed —
        // otherwise <audio>/<img> chips would re-mount on each poll.
        const sig = JSON.stringify(
          (data || []).map(a => a.id ?? a.fileUrl));
        if (sig !== this._attachmentsSig) {
          this.attachments = data;
          this._attachmentsSig = sig;
        }
      }
    });
  }
  private _attachmentsSig: string | null = null;

  loadAgents() {
    this.agentService.getAll().subscribe({
      next: (data: any[]) => {
        this.agents = data;
      }
    });
  }

  loadGroups() {
    this.agentGroupService.getAll().subscribe({
      next: (data: any[]) => {
        this.groups = data;
      }
    });
  }

  getAssignableAgents(): any[] {
    if (!this.selectedGroupId) return this.agents;
    const group = this.groups.find(g =>
      String(g?.id || '').toLowerCase() ===
      String(this.selectedGroupId || '').toLowerCase());
    if (!group) return this.agents;

    const memberIds: string[] = (group.memberIds || group.MemberIds || [])
      .map((id: any) => String(id).toLowerCase());
    if (memberIds.length === 0) return [];

    return this.agents.filter(a =>
      memberIds.includes(String(a?.id || '').toLowerCase()));
  }

  onGroupChanged(): void {
    const allowedIds = new Set(
      this.getAssignableAgents().map(a => String(a?.id || '').toLowerCase())
    );
    if (!this.selectedAgentId) return;
    if (!allowedIds.has(String(this.selectedAgentId).toLowerCase())) {
      this.selectedAgentId = '';
    }
  }

  loadTimeline() {
    this.http.get<any[]>(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/timeline`
    ).subscribe({
      next: (data) => { this.timeline = data; }
    });
  }

  recordView() {
    this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/view`,
      {}
    ).subscribe();
  }

  loadViewers() {
    this.http.get<any[]>(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/viewers`
    ).subscribe({
      next: (data) => { this.viewers = data; }
    });
  }

  loadWatchers() {
    this.watcherLoading = true;
    this.ticketService.getWatchers(this.ticketId)
      .subscribe({
        next: (data) => {
          this.runUiUpdate(() => {
            this.watchers = data || [];
            this.starred = this.hasAnyWatcher();
            this.watcherLoading = false;
          });
        },
        error: () => {
          this.runUiUpdate(() => {
            this.watcherLoading = false;
          });
        }
      });
  }

  loadOrgInfo() {
    this.http.get<any>(
      `${environment.apiUrl}/Organizations` +
      '/current'
    ).subscribe({
      next: (data) => {
        this.orgSupportEmail =
          data.smtpFromEmail ||
          data.supportEmail || '';
        this.orgSupportName =
          data.smtpFromName ||
          data.name || 'iM3 Support';
        // Prefill forward body once we know the ticket
        this.refreshForwardPrefill();
      }
    });
  }

  private refreshForwardPrefill() {
    if (!this.ticket) { this.forwardPrefillHtml = ''; return; }
    const num = this.ticket.ticketNumber;
    const name = this.senderName() || 'the customer';
    const email = this.senderEmail();
    this.forwardPrefillHtml =
      `<p>Please take a look at ticket ` +
      `<strong>#${num}</strong> ` +
      `raised by <strong>${name}</strong>` +
      (email ? ` (<a href="mailto:${email}">${email}</a>)` : '') +
      `.</p>`;
    this.forwardText = this.forwardPrefillHtml;
  }

  loadAgentSignature() {
    this.http.get<any>(`${environment.apiUrl}/Profile`).subscribe({
      next: (profile) => {
        const userId = profile?.id || profile?.userId;
        if (!userId) return;
        this.http.get<any>(
          `${environment.apiUrl}/Agents/${userId}`
        ).subscribe({
          next: (d) => {
            this.agentSignature = d.signature || '';
          }
        });
      }
    });
  }

  loadCustomFieldValues() {
    this.http.get<any[]>(
      `${environment.apiUrl}/CustomFields`
    ).subscribe({
      next: (fields) => {
        this.runUiUpdate(() => {
          this.customFields = fields;
        });
        if (!fields.length) return;

        this.http.get<any[]>(
          `${environment.apiUrl}/CustomFields` +
          `/ticket/${this.ticketId}/values`
        ).subscribe({
          next: (values) => {
            this.runUiUpdate(() => {
              fields.forEach(f => {
                this.customFieldValues[f.id] = '';
              });
              values.forEach(v => {
                this.customFieldValues[
                  v.customFieldId] = v.value;
              });
            });
          }
        });
      }
    });
  }

  saveCustomFields() {
    const values = Object.entries(
      this.customFieldValues)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => ({
        customFieldId: k,
        value: String(v)
      }));

    this.http.post(
      `${environment.apiUrl}/CustomFields` +
      `/ticket/${this.ticketId}/values`,
      values
    ).subscribe({
      next: () =>
        this.showToast('success',
          'Custom fields saved!')
    });
  }

  // ─────────────────────────────────────
  // TICKET UPDATES
  // ─────────────────────────────────────
  updateStatus(status: string) {
    this.http.put(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/status`,
      { status: status }
    ).subscribe({
      next: () => {
        this.showToast('success',
          'Status updated!');
        this.loadTimeline();
      },
      error: (err) => {
        this.showToast('error',
          err.error?.message ||
          'Status update failed');
        this.loadTicket(); // revert
      }
    });
  }

  updatePriority(priority: string) {
    this.http.put(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/priority`,
      { priority }
    ).subscribe({
      next: () => {
        this.showToast('success',
          'Priority updated!');
      }
    });
  }

  updateTicketType() {
    this.http.put(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/type`,
      { ticketType: this.ticket.ticketType }
    ).subscribe({
      next: () =>
        this.showToast('success', 'Type updated!')
    });
  }

  addTag() {
    if (!this.newTag.trim()) return;
    const tags = this.getTagsArray();
    const tag = this.newTag.trim().toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);

    this.ticketService
      .updateTags(this.ticketId, tags)
      .subscribe({
        next: () => {
          this.newTag = '';
          this.loadTicket();
        }
      });
  }

  removeTag(tag: string) {
    const tags = this.getTagsArray()
      .filter(t => t !== tag);
    this.ticketService
      .updateTags(this.ticketId, tags)
      .subscribe({ next: () => this.loadTicket() });
  }

  /** Stage a tag locally — commits on next Update click. */
  stageAddTag() {
    if (!this.newTag.trim() || !this.ticket) return;
    const tags = this.getTagsArray();
    const tag = this.newTag.trim().toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
    this.runUiUpdate(() => {
      if (!this.ticket) return;
      this.ticket.tags = tags.join(',');
      this.newTag = '';
    });
  }

  /** Stage a tag removal locally — commits on next Update click. */
  stageRemoveTag(tag: string) {
    if (!this.ticket) return;
    const tags = this.getTagsArray().filter(t => t !== tag);
    this.runUiUpdate(() => {
      if (!this.ticket) return;
      this.ticket.tags = tags.join(',');
    });
  }

  deleteTicket() {
    if (!confirm(
      'Delete this ticket permanently?')) return;

    this.ticketService.delete(this.ticketId).subscribe({
      next: () => {
        this.showToast('success', 'Ticket deleted');
        this.router.navigate(['/tickets']);
      },
      error: () =>
        this.showToast('error', 'Delete failed')
    });
  }

  // ─────────────────────────────────────
  // COMPOSER METHODS
  // ─────────────────────────────────────
  onReplyInput(event: any) {
    this.quickReplyText =
      event.target.innerHTML || '';
  }

  onNoteInput(event: any) {
    this.noteText = event.target.innerHTML || '';
  }

  onForwardInput(event: any) {
    this.forwardText =
      event.target.innerHTML || '';
  }

  execCmd(command: string, value?: string) {
    document.execCommand(command, false, value);
  }

  /** Apply a block-level format such as H1, H2, P, PRE, BLOCKQUOTE. */
  applyBlock(tag: string) {
    document.execCommand('formatBlock', false, tag);
  }

  /** Open color picker and apply foreColor. */
  pickColor(kind: 'fore' | 'back') {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = kind === 'fore' ? '#000000' : '#ffff00';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.addEventListener('change', () => {
      const v = input.value;
      const cmd = kind === 'fore' ? 'foreColor' : 'hiliteColor';
      document.execCommand(cmd, false, v);
      document.body.removeChild(input);
    });
    document.body.appendChild(input);
    input.click();
  }

  insertLink() {
    const url = prompt('Enter URL:');
    if (url)
      document.execCommand(
        'createLink', false, url);
  }

  /** Insert inline image from URL prompt or local file. */
  insertImage() {
    const url = prompt('Image URL (leave blank to upload a file):');
    if (url && url.trim()) {
      document.execCommand('insertImage', false, url.trim());
      return;
    }
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    fi.addEventListener('change', () => {
      const f = fi.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (dataUrl)
          document.execCommand('insertImage', false, dataUrl);
      };
      reader.readAsDataURL(f);
    });
    fi.click();
  }

  /** Insert a basic HTML table at the cursor. */
  insertTable() {
    const raw = prompt('Rows x Cols (e.g. 3x3):', '3x3');
    if (!raw) return;
    const m = raw.match(/^(\d+)\s*[xX*]\s*(\d+)$/);
    if (!m) return;
    const rows = Math.min(20, Math.max(1, parseInt(m[1], 10)));
    const cols = Math.min(10, Math.max(1, parseInt(m[2], 10)));
    let html = '<table style="border-collapse:collapse;width:100%;">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const tag = r === 0 ? 'th' : 'td';
        html += `<${tag} style="border:1px solid #d0d7de;padding:6px 10px;">&nbsp;</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table><p></p>';
    document.execCommand('insertHTML', false, html);
  }

  /** Insert a <pre><code> block at the cursor with the current selection. */
  insertCodeBlock() {
    const sel = window.getSelection()?.toString() || '';
    const html = `<pre style="background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;overflow:auto;"><code>${
      sel ? sel.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[ch]) : 'code'
    }</code></pre><p></p>`;
    document.execCommand('insertHTML', false, html);
  }

  /** Remove formatting from the current selection. */
  clearFormatting() {
    document.execCommand('removeFormat');
    document.execCommand('unlink');
  }

  onFileSelect(event: any) {
    const files =
      Array.from(event.target.files) as File[];
    this.pendingFiles.push(...files);
  }

  removePendingFile(index: number) {
    this.pendingFiles.splice(index, 1);
  }

  // ── Cc / Bcc handlers (reply) ──────────────
  private isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }
  addCc() {
    const v = (this.ccInput || '').trim();
    if (!v) return;
    if (this.isValidEmail(v) && !this.replyCc.includes(v))
      this.replyCc.push(v);
    this.ccInput = '';
  }
  removeCc(i: number) { this.replyCc.splice(i, 1); }

  /**
   * Pre-populate the reply Cc list from the ticket's stored CcEmails
   * (captured from the original inbound email and merged on each inbound
   * reply). Filters out our own support address and the ticket sender so
   * we never echo them back into the loop. Runs once per ticket load —
   * after that, the agent's manual edits on the Cc chips are preserved.
   */
  private prefillReplyCcFromTicket() {
    if (!this.ticket) return;
    const raw: string = String(this.ticket.ccEmails || '').trim();
    if (!raw) return;
    const support = (this.orgSupportEmail || '').toLowerCase();
    const sender = (this.ticket.fromEmail || '').toLowerCase();
    const merged = new Set<string>(this.replyCc.map(e => e.toLowerCase()));
    const next = [...this.replyCc];
    raw.split(',').forEach(part => {
      const e = part.trim();
      if (!e) return;
      const k = e.toLowerCase();
      if (k === support || k === sender || merged.has(k)) return;
      if (!this.isValidEmail(e)) return;
      merged.add(k);
      next.push(e);
    });
    if (next.length !== this.replyCc.length) {
      this.replyCc = next;
      this.showCc = true;
    }
  }

  addBcc() {
    const v = (this.bccInput || '').trim();
    if (!v) return;
    if (this.isValidEmail(v) && !this.replyBcc.includes(v))
      this.replyBcc.push(v);
    this.bccInput = '';
  }
  removeBcc(i: number) { this.replyBcc.splice(i, 1); }

  // ── Cc / Bcc handlers (forward) ────────────
  addFwdCc() {
    const v = (this.fwdCcInput || '').trim();
    if (!v) return;
    if (this.isValidEmail(v) && !this.fwdCc.includes(v))
      this.fwdCc.push(v);
    this.fwdCcInput = '';
  }
  addFwdBcc() {
    const v = (this.fwdBccInput || '').trim();
    if (!v) return;
    if (this.isValidEmail(v) && !this.fwdBcc.includes(v))
      this.fwdBcc.push(v);
    this.fwdBccInput = '';
  }

  clearReply() {
    this.quickReplyText = '';
    if (this.replyEditorRef?.nativeElement)
      this.replyEditorRef.nativeElement.innerHTML
        = '';
    this.pendingFiles = [];
    this.composerExpanded = false;
  }

  clearComposer() {
    this.quickReplyText = '';
    this.noteText = '';
    this.pendingFiles = [];
    if (this.replyEditorRef?.nativeElement)
      this.replyEditorRef.nativeElement.innerHTML
        = '';
    if (this.noteEditorRef?.nativeElement)
      this.noteEditorRef.nativeElement.innerHTML
        = '';
    this.composerExpanded = false;
  }

  /** Expand composer when user clicks the collapsed input/tabs. */
  expandComposer(tab?: 'reply' | 'note' | 'forward') {
    if (tab) this.activeComposerTab = tab;
    this.composerExpanded = true;
    // Focus the editor of the selected tab after Angular renders.
    setTimeout(() => {
      const ref =
        this.activeComposerTab === 'reply' ? this.replyEditorRef
        : this.activeComposerTab === 'note' ? this.noteEditorRef
        : this.forwardEditorRef;
      ref?.nativeElement?.focus?.();
    }, 0);
  }

// ✅ Remove ngZone dependency
// Simply wrap state changes in setTimeout

// Find these methods and update:

async sendReply() {
  const content =
    this.replyEditorRef?.nativeElement
      ?.innerHTML?.trim()
    || this.quickReplyText?.trim();

  if (!content || content === '<br>') return;
  if (this.updating) return;

  this.updating = true;

  try {
    const res: any = await this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/comments`,
      {
        comment: content,
        isInternal: false,
        cc: this.replyCc,
        bcc: this.replyBcc,
        notifyUserIds: this.notifyAgents
          .filter(a => a.kind !== 'contact' && a.id)
          .map(a => a.id),
        notifyEmails: this.notifyAgents
          .map(a => a.email)
          .filter((e: string) => !!e)
      }
    ).toPromise();

    const commentId = res?.commentId;

    if (commentId &&
        this.pendingFiles.length > 0) {
      for (const file of this.pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await this.http.post(
          environment.baseUrl +
          `/api/Attachments/upload` +
          `/${this.ticketId}` +
          `?commentId=${commentId}`,
          fd
        ).toPromise();
      }
    }

    this.clearReply();
    this.replyCc = [];
    this.replyBcc = [];
    this.showCc = false;
    this.showBcc = false;
    this.notifyAgents = [];
    this.notifyTo = '';

    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('success', 'Reply sent!');
      this.loadTicket();
      this.loadAttachments();
      this.loadTimeline();
    }, 0);
  } catch {
    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('error', 'Reply failed');
    }, 0);
  }
}

async sendNote() {
  const content =
    this.noteEditorRef?.nativeElement
      ?.innerHTML?.trim()
    || this.noteText?.trim();

  if (!content || content === '<br>') return;
  if (this.updating) return;

  this.updating = true;

  try {
    const res: any = await this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/comments`,
      {
        comment: content,
        isInternal: this.noteIsPrivate,
        notifyUserIds: this.notifyAgents
          .filter(a => a.kind !== 'contact' && a.id)
          .map(a => a.id),
        notifyEmails: this.notifyAgents
          .map(a => a.email)
          .filter((e: string) => !!e)
      },
      {}
    ).toPromise();

    const commentId = res?.commentId;

    if (commentId &&
        this.pendingFiles.length > 0) {
      for (const file of this.pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await this.http.post(
          environment.baseUrl +
          `/api/Attachments/upload` +
          `/${this.ticketId}` +
          `?commentId=${commentId}`,
          fd
        ).toPromise();
      }
    }

    this.noteText = '';
    if (this.noteEditorRef?.nativeElement)
      this.noteEditorRef.nativeElement.innerHTML
        = '';
    this.pendingFiles = [];
    this.notifyAgents = [];
    this.notifyTo = '';

    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('success', 'Note added!');
      this.loadTicket();
      this.loadAttachments();
      this.loadTimeline();
    }, 0);
  } catch {
    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('error', 'Note failed');
    }, 0);
  }
}

updateAllProps() {
  if (this.updating) return;
  if (!this.ticket) return;

  this.updating = true;

  const base = `${environment.apiUrl}/Tickets/${this.ticketId}`;

  const calls: Promise<any>[] = [
    this.http.put(`${base}/status`,
      { status: this.ticket.status }).toPromise(),
    this.http.put(`${base}/priority`,
      { priority: this.ticket.priority }).toPromise(),
    this.http.put(`${base}/type`,
      { ticketType: this.ticket.ticketType }).toPromise(),
    this.http.put(`${base}/assign`,
      { agentId: this.selectedAgentId || null }).toPromise(),
    this.http.put(`${base}/group`,
      { agentGroupId: this.selectedGroupId || null }).toPromise(),
    this.ticketService
      .updateTags(this.ticketId, this.getTagsArray())
      .toPromise()
  ];

  // Custom fields are now folded into the same Update action —
  // no more standalone "Save Fields" button.
  if (this.customFields.length > 0) {
    const cfValues = Object.entries(this.customFieldValues)
      .filter(([, v]) => v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => ({ customFieldId: k, value: String(v) }));
    calls.push(
      this.http.post(
        `${environment.apiUrl}/CustomFields/ticket/${this.ticketId}/values`,
        cfValues
      ).toPromise()
    );
  }

  Promise.all(calls).then(() => {
    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('success', 'Updated successfully!');
      this.loadTicket();
      this.loadTimeline();
    }, 0);
  }).catch(() => {
    setTimeout(() => {
      this.updating = false;
      this.cdr.detectChanges();
      this.showToast('error', 'Update failed');
      this.loadTicket();
    }, 0);
  });
}

  // ─────────────────────────────────────
  // FORWARD
  // ─────────────────────────────────────
  doForward() {
    if (!this.forwardEmail?.trim()) {
      this.showToast('error',
        'Enter forwarding email');
      return;
    }

    if (this.updating || this.forwarding) return;
    this.forwarding = true;

    // Forward via API email
    this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/forward`,
      {
        toEmail: this.forwardEmail,
        message: this.forwardText,
        cc: this.fwdCc,
        bcc: this.fwdBcc,
        notifyUserIds: this.notifyAgents
          .filter(a => a.kind !== 'contact' && a.id)
          .map(a => a.id),
        notifyEmails: this.notifyAgents
          .map(a => a.email)
          .filter((e: string) => !!e)
      }
    ).subscribe({
      next: (res: any) => {
        const commentId = res?.commentId;
        // Upload any queued attachments against the
        // forward comment so they appear in the conversation thread.
        const pending = [...this.pendingFiles];
        const uploads: Promise<any>[] = [];
        if (commentId && pending.length > 0) {
          for (const file of pending) {
            const fd = new FormData();
            fd.append('file', file);
            uploads.push(
              this.http.post(
                environment.baseUrl +
                `/api/Attachments/upload` +
                `/${this.ticketId}` +
                `?commentId=${commentId}`,
                fd
              ).toPromise()
            );
          }
        }
        Promise.all(uploads).catch(() => {
          this.showToast('error', 'Some attachments failed to upload');
        }).finally(() => {
          this.forwardEmail = '';
          this.forwardText = '';
          this.fwdCc = [];
          this.fwdBcc = [];
          this.showFwdCc = false;
          this.showFwdBcc = false;
          this.notifyAgents = [];
          this.notifyTo = '';
          this.pendingFiles = [];
          this.activeComposerTab = 'note';
          this.composerExpanded = false;
          if (this.forwardEditorRef?.nativeElement)
            this.forwardEditorRef.nativeElement
              .innerHTML = '';
          setTimeout(() => {
            this.forwarding = false;
            this.cdr.detectChanges();
            this.showToast('success', 'Forwarded successfully!');
            this.loadTicket();
            this.loadAttachments();
            this.loadTimeline();
          }, 0);
        });
      },
      error: (err) => {
        setTimeout(() => {
          this.forwarding = false;
          this.cdr.detectChanges();
          this.showToast('error',
            err.error?.message || 'Forward failed');
        }, 0);
      }
    });
  }

  // ─────────────────────────────────────
  // MENTION
  // ─────────────────────────────────────
  searchAgentsForMention(event: any) {
    const q = (event.target.value || '').toLowerCase().replace(/^@/, '').trim();
    if (!q || q.length < 1) {
      this.mentionResults = [];
      return;
    }
    // Agents: match by name or email
    const agentMatches = (this.agents || [])
      .filter(a =>
        a.fullName?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q))
      .map(a => ({
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        kind: 'agent'
      }));

    // Ticket-related contacts (requester + cc/bcc emails)
    const contactEmails = new Set<string>();
    const requester = this.ticket?.createdBy;
    if (requester?.email) contactEmails.add(requester.email);
    if (this.ticket?.fromEmail) contactEmails.add(this.ticket.fromEmail);
    (this.getTicketCcList?.() || []).forEach((e: string) => e && contactEmails.add(e));
    (this.getTicketBccList?.() || []).forEach((e: string) => e && contactEmails.add(e));

    const contactMatches = Array.from(contactEmails)
      .filter(e => e.toLowerCase().includes(q))
      .map(e => ({
        id: 'c:' + e,
        fullName: e.split('@')[0],
        email: e,
        kind: 'contact'
      }));

    // Dedupe by email, agents first
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const m of [...agentMatches, ...contactMatches]) {
      const key = (m.email || m.id || '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
    this.mentionResults = merged.slice(0, 8);
  }

  addMention(agent: any) {
    if (!this.notifyAgents.find(
      a => (a.email || a.id) === (agent.email || agent.id)))
      this.notifyAgents.push(agent);
    // Defer the clear so the click's CD pass completes first (avoids NG0100)
    setTimeout(() => {
      this.notifyTo = '';
      this.mentionResults = [];
    }, 0);
  }

  removeNotify(agent: any) {
    this.notifyAgents =
      this.notifyAgents.filter(
        a => a.id !== agent.id);
  }

  logout() {
    this.authService.logout();
  }
}