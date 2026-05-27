import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ChangeDetectorRef, inject,
  ViewChild, ElementRef,
  ChangeDetectionStrategy,
  SecurityContext
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
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { TicketService } from '../../../core/services/ticket';
import { AgentService } from '../../../core/services/agent';
import { AgentGroupService }
  from '../../../core/services/agent-group';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { DomSanitizer } from '@angular/platform-browser';
import { environment } from '../../../../environments/environment';
import { TicketMasterOption, TicketMasterService } from '../../../core/services/ticket-master';
import { TopbarContextService } from '../../../core/services/topbar-context.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [
    CommonModule, FormsModule,
    ReactiveFormsModule, RouterModule,
    MatProgressSpinnerModule,
    LayoutComponent 
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
  agents: any[] = [];
  groups: any[] = [];
  ticketId = '';
  isAgent = false;

  // ─── Composer ────────────────────────
  // ✅ single variable controls tabs
  activeComposerTab:
    'reply' | 'note' | 'forward' = 'reply';

  /** Composer starts collapsed (small one-line input). Expands on click. */
  composerExpanded = false;

  quickReplyText = '';
  noteText = '';
  noteIsPrivate = true;
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
  timeline: any[] = [];
  showTimeline = true;

  statuses: TicketMasterOption[] = [];
  priorities: TicketMasterOption[] = [];
  ticketTypes: TicketMasterOption[] = [];

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

  sanitizeHtml(html: string): string {
    if (!html) return '';
    return this.sanitizer.sanitize(
      SecurityContext.HTML,
      html
    ) || '';
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
  /** Unique viewers by userId (fallback userName) so multiple visits collapse. */
  uniqueViewers(): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const v of this.viewers || []) {
      const key = String(v?.userId ?? v?.userName ?? '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }
  uniqueViewerNames(): string {
    return this.uniqueViewers()
      .map(v => v?.userName || 'Unknown')
      .join('\n');
  }

  /** "11 days ago", "3 hours ago", "just now". */
  timeAgo(value: string | Date | null | undefined): string {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Math.max(0, Date.now() - then);
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
  /**
   * "To:" line for an agent reply / outbound comment — addressed back to the
   * ticket sender. For inbound replies (customer email) we show the org
   * support address instead.
   */
  getReplyToList(c: any): string[] {
    if (!c) return [];
    // Inbound email from the customer side → goes to our support address.
    if (c.source === 'email' && !c.user?.isAgent) {
      return this.orgSupportEmail ? [this.orgSupportEmail] : [];
    }
    // Agent outbound → addressed back to the ticket sender.
    const to = this.ticket?.fromEmail;
    return to ? [to] : [];
  }


  /** Note edit/delete are allowed only within 1 hour of creation. */
  canEditNote(c: any): boolean {
    if (!c?.isInternal || !this.isAgent) return false;
    const created = c?.createdAt ? new Date(c.createdAt).getTime() : 0;
    if (!created) return false;
    const oneHourMs = 60 * 60 * 1000;
    return Date.now() - created < oneHourMs;
  }

  /** Inline edit of a private note (within 1 hour). */
  editNote(c: any) {
    if (!this.canEditNote(c)) return;
    const stripped = String(c.comment || '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const next = window.prompt('Edit note:', stripped);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === stripped) return;

    this.http.put(
      `${environment.apiUrl}/Tickets/${this.ticketId}/comments/${c.id}`,
      { comment: trimmed, isInternal: true }
    ).subscribe({
      next: () => {
        c.comment = trimmed;
        this.showToast('success', 'Note updated');
      },
      error: (err) => {
        this.showToast('error',
          err?.error?.message || 'Failed to update note');
      }
    });
  }

  /** Delete a private note (within 1 hour). */
  deleteNote(c: any) {
    if (!this.canEditNote(c)) return;
    if (!window.confirm('Delete this private note? This cannot be undone.')) return;

    this.http.delete(
      `${environment.apiUrl}/Tickets/${this.ticketId}/comments/${c.id}`
    ).subscribe({
      next: () => {
        this.ticket.comments =
          (this.ticket.comments || []).filter((x: any) => x.id !== c.id);
        this.showToast('success', 'Note deleted');
      },
      error: (err) => {
        this.showToast('error',
          err?.error?.message || 'Failed to delete note');
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
    return this.attachments.filter(
      a => a.commentId === commentId);
  }

  getTicketAttachments(): any[] {
    if (!this.attachments) return [];
    return this.attachments.filter(
      a => !a.commentId);
  }

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
    this.ticketId =
      this.route.snapshot.paramMap
        .get('id') || '';
    const role = this.authService.getUserRole();
    this.isAgent = ['Agent', 'CompanyAdmin', 'SuperAdmin'].includes(role);

    this.loadTicket();
    this.loadMasterOptions();
    this.loadAttachments();
    this.loadAgents();
    this.loadGroups();
    this.loadAgentSignature();
    this.loadTimeline();
    this.loadCustomFieldValues();
  }

  loadMasterOptions() {
    this.ticketMasterService.getAll(true).subscribe({
      next: (data) => {
        this.ticketTypes = data.ticketTypes || [];
        this.statuses = data.ticketStatuses || [];
        this.priorities = data.ticketPriorities || [];
      }
    });
  }

  ngAfterViewInit() {
    // Run these after first render to avoid NG0100 in dev-mode
    // (some requests can resolve synchronously via caching/interceptors).
    setTimeout(() => {
      this.loadOrgInfo();
      this.startPolling();
    }, 0);
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
        this.ticket = data;
        this.setLoading(false);

        if (data.assignedTo?.id)
          this.selectedAgentId = data.assignedTo.id;
        if (data.agentGroup?.id)
          this.selectedGroupId = data.agentGroup.id;
        this.loadViewers();
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
      next: (data) => { this.attachments = data; }
    });
  }

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
      `<a href="javascript:void(0)">#${num}</a> ` +
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
        this.customFields = fields;
        if (!fields.length) return;

        this.http.get<any[]>(
          `${environment.apiUrl}/CustomFields` +
          `/ticket/${this.ticketId}/values`
        ).subscribe({
          next: (values) => {
            fields.forEach(f => {
              this.customFieldValues[f.id] = '';
            });
            values.forEach(v => {
              this.customFieldValues[
                v.customFieldId] = v.value;
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
    this.ticket.tags = tags.join(',');
    this.newTag = '';
  }

  /** Stage a tag removal locally — commits on next Update click. */
  stageRemoveTag(tag: string) {
    if (!this.ticket) return;
    const tags = this.getTagsArray().filter(t => t !== tag);
    this.ticket.tags = tags.join(',');
  }

  deleteTicket() {
    if (!confirm(
      'Delete this ticket permanently?')) return;

    this.http.delete(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}`
    ).subscribe({
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

  // ✅ Use setTimeout to avoid ExpressionChanged
  setTimeout(() => {
    this.updating = true;
  }, 0);

  try {
    const res: any = await this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/comments`,
      {
        comment: content,
        isInternal: false,
        cc: this.replyCc,
        bcc: this.replyBcc
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
    setTimeout(() => {
      this.updating = false;
    }, 0);

    this.showToast('success', 'Reply sent!');
    this.loadTicket();
    this.loadAttachments();
    this.loadTimeline();
  } catch {
    setTimeout(() => {
      this.updating = false;
    }, 0);
    this.showToast('error', 'Reply failed');
  }
}

async sendNote() {
  const content =
    this.noteEditorRef?.nativeElement
      ?.innerHTML?.trim()
    || this.noteText?.trim();

  if (!content || content === '<br>') return;
  if (this.updating) return;

  setTimeout(() => { this.updating = true; }, 0);

  try {
    const res: any = await this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/comments`,
      {
        comment: content,
        isInternal: this.noteIsPrivate,
        notifyUserIds: this.notifyAgents.map(a => a.id),
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
    }, 0);

    this.showToast('success', 'Note added!');
    this.loadTicket();
    this.loadAttachments();
    this.loadTimeline();
  } catch {
    setTimeout(() => {
      this.updating = false;
    }, 0);
    this.showToast('error', 'Note failed');
  }
}

updateAllProps() {
  if (this.updating) return;
  if (!this.ticket) return;

  setTimeout(() => { this.updating = true; }, 0);

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

  Promise.all(calls).then(() => {
    setTimeout(() => { this.updating = false; }, 0);
    this.showToast('success', 'Updated successfully!');
    this.loadTicket();
    this.loadTimeline();
  }).catch(() => {
    setTimeout(() => { this.updating = false; }, 0);
    this.showToast('error', 'Update failed');
    this.loadTicket();
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

    if (this.updating) return;
    this.updating = true;

    // Forward via API email
    this.http.post(
      `${environment.apiUrl}/Tickets` +
      `/${this.ticketId}/forward`,
      {
        toEmail: this.forwardEmail,
        message: this.forwardText,
        cc: this.fwdCc,
        bcc: this.fwdBcc
      }
    ).subscribe({
      next: () => {
        this.forwardEmail = '';
        this.forwardText = '';
        this.fwdCc = [];
        this.fwdBcc = [];
        this.showFwdCc = false;
        this.showFwdBcc = false;
        this.activeComposerTab = 'reply';
        this.composerExpanded = false;
        if (this.forwardEditorRef?.nativeElement)
          this.forwardEditorRef.nativeElement
            .innerHTML = '';
        this.updating = false;
        this.showToast('success',
          'Forwarded successfully!');
        this.loadTicket();
        this.loadTimeline();
      },
      error: (err) => {
        this.updating = false;
        this.showToast('error',
          err.error?.message || 'Forward failed');
      }
    });
  }

  // ─────────────────────────────────────
  // MENTION
  // ─────────────────────────────────────
  searchAgentsForMention(event: any) {
    const q = event.target.value?.toLowerCase();
    if (!q || q.length < 1) {
      this.mentionResults = [];
      return;
    }
    this.mentionResults = this.agents
      .filter(a =>
        a.fullName?.toLowerCase().includes(q))
      .slice(0, 5);
  }

  addMention(agent: any) {
    if (!this.notifyAgents.find(
      a => a.id === agent.id))
      this.notifyAgents.push(agent);
    this.notifyTo = '';
    this.mentionResults = [];
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