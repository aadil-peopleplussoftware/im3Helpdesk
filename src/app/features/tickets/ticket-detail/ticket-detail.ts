import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject,
  ViewChild, ElementRef,
  ChangeDetectionStrategy
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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TicketService } from '../../../services/ticket';
import { AgentService } from '../../../services/agent';
import { AgentGroupService }
  from '../../../services/agent-group';
import { AuthService } from '../../../services/auth.service';
import { LayoutComponent }
  from '../../../shared/layout/layout';
import { DomSanitizer, SafeHtml }
  from '@angular/platform-browser';

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
  implements OnInit, OnDestroy {

  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private ticketService = inject(TicketService);
  private agentService = inject(AgentService);
  private agentGroupService =
    inject(AgentGroupService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();
  private sanitizer = inject(DomSanitizer);

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

  quickReplyText = '';
  noteText = '';
  noteIsPrivate = true;
  forwardEmail = '';
  forwardText = '';
  pendingFiles: File[] = [];
  attachments: any[] = [];

  // ─── Notify ──────────────────────────
  notifyTo = '';
  notifyAgents: any[] = [];
  mentionResults: any[] = [];

  // ─── Props ───────────────────────────
  selectedAgentId = '';
  selectedGroupId = '';
  newTag = '';

  // ─── Org / Signature ─────────────────
  orgSupportEmail = '';
  agentSignature = '';

  // ─── Custom Fields ───────────────────
  customFields: any[] = [];
  customFieldValues: { [key: string]: any } = {};

  // ─── Viewers / Timeline ──────────────
  viewers: any[] = [];
  timeline: any[] = [];
  showTimeline = true;

  statuses = [
    'Open', 'InProgress', 'Pending',
    'Resolved', 'Closed'
  ];

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

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  sanitizeHtml(html: string): SafeHtml {
    if (!html) return '';
    return this.sanitizer
      .bypassSecurityTrustHtml(html);
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    return colors[
      (name?.charCodeAt(0) || 0) % colors.length];
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

    const token = this.authService.getToken();
    if (token) {
      try {
        const p = JSON.parse(
          atob(token.split('.')[1]));
        const role = p[
          'http://schemas.microsoft.com/ws/' +
          '2008/06/identity/claims/role'
        ] || p.role || '';
        this.isAgent = ['Agent', 'CompanyAdmin',
          'SuperAdmin'].includes(role);
      } catch {}
    }

    Promise.resolve().then(() => {
      this.loadTicket();
      this.loadAttachments();
      this.loadAgents();
      this.loadGroups();
      this.loadOrgInfo();
      this.loadAgentSignature();
      this.loadTimeline();
      this.loadCustomFieldValues();
      this.startPolling();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
        this.loading = false;

        if (data.assignedTo?.id)
          this.selectedAgentId = data.assignedTo.id;
        if (data.agentGroup?.id)
          this.selectedGroupId = data.agentGroup.id;

        this.cdr.detectChanges(); // ← YE ADD KARO
        this.loadViewers();
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges(); // ← YE BHI
        if (err.status === 404)
          this.router.navigate(['/tickets']);
      }
    });
}

  loadAttachments() {
    this.http.get<any[]>(
      `https://localhost:7071/api/Attachments` +
      `/ticket/${this.ticketId}`,
      { headers: this.getHeaders() }
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
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/timeline`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.timeline = data; }
    });
  }

  recordView() {
    this.http.post(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/view`,
      {},
      { headers: this.getHeaders() }
    ).subscribe();
  }

  loadViewers() {
    this.http.get<any[]>(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/viewers`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.viewers = data; }
    });
  }

  loadOrgInfo() {
    this.http.get<any>(
      'https://localhost:7071/api/Organizations' +
      '/current',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.orgSupportEmail =
          data.supportEmail || '';
      }
    });
  }

  loadAgentSignature() {
    const token = this.authService.getToken();
    if (!token) return;
    try {
      const p = JSON.parse(
        atob(token.split('.')[1]));
      const userId = p.sub ||
        p['http://schemas.xmlsoap.org/ws/2005/' +
          '05/identity/claims/nameidentifier'];
      if (!userId) return;

      this.http.get<any>(
        `https://localhost:7071/api/Agents` +
        `/${userId}`,
        { headers: this.getHeaders() }
      ).subscribe({
        next: (d) => {
          this.agentSignature = d.signature || '';
        }
      });
    } catch {}
  }

  loadCustomFieldValues() {
    this.http.get<any[]>(
      'https://localhost:7071/api/CustomFields',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (fields) => {
        this.customFields = fields;
        if (!fields.length) return;

        this.http.get<any[]>(
          `https://localhost:7071/api/CustomFields` +
          `/ticket/${this.ticketId}/values`,
          { headers: this.getHeaders() }
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
      `https://localhost:7071/api/CustomFields` +
      `/ticket/${this.ticketId}/values`,
      values,
      { headers: this.getHeaders() }
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
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/status`,
      { status: status },
      { headers: this.getHeaders() }
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
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/priority`,
      { priority },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.showToast('success',
          'Priority updated!');
      }
    });
  }

  updateTicketType() {
    this.http.put(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/type`,
      { ticketType: this.ticket.ticketType },
      { headers: this.getHeaders() }
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

  deleteTicket() {
    if (!confirm(
      'Delete this ticket permanently?')) return;

    this.http.delete(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}`,
      { headers: this.getHeaders() }
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

  insertLink() {
    const url = prompt('Enter URL:');
    if (url)
      document.execCommand(
        'createLink', false, url);
  }

  onFileSelect(event: any) {
    const files =
      Array.from(event.target.files) as File[];
    this.pendingFiles.push(...files);
  }

  removePendingFile(index: number) {
    this.pendingFiles.splice(index, 1);
  }

  clearReply() {
    this.quickReplyText = '';
    if (this.replyEditorRef?.nativeElement)
      this.replyEditorRef.nativeElement.innerHTML
        = '';
    this.pendingFiles = [];
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
    const uploadHeaders = new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });

    const res: any = await this.http.post(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/comments`,
      { comment: content, isInternal: false },
      { headers: this.getHeaders() }
    ).toPromise();

    const commentId = res?.commentId;

    if (commentId &&
        this.pendingFiles.length > 0) {
      for (const file of this.pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await this.http.post(
          `https://localhost:7071` +
          `/api/Attachments/upload` +
          `/${this.ticketId}` +
          `?commentId=${commentId}`,
          fd,
          { headers: uploadHeaders }
        ).toPromise();
      }
    }

    this.clearReply();
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
    const uploadHeaders = new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });

    const res: any = await this.http.post(
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/comments`,
      {
        comment: content,
        isInternal: this.noteIsPrivate
      },
      { headers: this.getHeaders() }
    ).toPromise();

    const commentId = res?.commentId;

    if (commentId &&
        this.pendingFiles.length > 0) {
      for (const file of this.pendingFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await this.http.post(
          `https://localhost:7071` +
          `/api/Attachments/upload` +
          `/${this.ticketId}` +
          `?commentId=${commentId}`,
          fd,
          { headers: uploadHeaders }
        ).toPromise();
      }
    }

    this.noteText = '';
    if (this.noteEditorRef?.nativeElement)
      this.noteEditorRef.nativeElement.innerHTML
        = '';
    this.pendingFiles = [];

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

  setTimeout(() => { this.updating = true; }, 0);

  const p1 = this.http.put(
    `https://localhost:7071/api/Tickets` +
    `/${this.ticketId}/assign`,
    { agentId: this.selectedAgentId || null },
    { headers: this.getHeaders() }
  ).toPromise();

  const p2 = this.http.put(
    `https://localhost:7071/api/Tickets` +
    `/${this.ticketId}/group`,
    { agentGroupId:
        this.selectedGroupId || null },
    { headers: this.getHeaders() }
  ).toPromise();

  Promise.all([p1, p2]).then(() => {
    setTimeout(() => {
      this.updating = false;
    }, 0);
    this.showToast('success',
      'Updated successfully!');
    this.loadTicket();
    this.loadTimeline();
  }).catch(() => {
    setTimeout(() => {
      this.updating = false;
    }, 0);
    this.showToast('error', 'Update failed');
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
      `https://localhost:7071/api/Tickets` +
      `/${this.ticketId}/forward`,
      {
        toEmail: this.forwardEmail,
        message: this.forwardText
      },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.forwardEmail = '';
        this.forwardText = '';
        this.activeComposerTab = 'reply';
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