import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject,
  ChangeDetectionStrategy,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Router, RouterModule,
  ActivatedRoute
} from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray
} from '@angular/cdk/drag-drop';
import { ToastrService } from 'ngx-toastr';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { TicketMasterOption, TicketMasterService } from '../../../core/services/ticket-master';
import { OrgContextService } from '../../../core/services/org-context.service';
import { AgentService } from '../../../core/services/agent';


@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DragDropModule,
    LayoutComponent,
    HasPermissionDirective
  ],
  templateUrl: './ticket-list.html',
  styleUrls: ['./ticket-list.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TicketListComponent
  implements OnInit, OnDestroy {

  private authService = inject(AuthService);
  public router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  public cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private agentService = inject(AgentService);
  private ticketMasterService = inject(TicketMasterService);
  private orgContext = inject(OrgContextService);

  /** Project-wide IANA timezone (e.g. 'Asia/Kolkata') for date columns. */
  get tz(): string { return this.orgContext.timezone(); }
  private destroy$ = new Subject<void>();

  allTickets: any[] = [];
  tickets: any[] = [];
  loading = true;
  currentLayout: 'card' | 'table' | 'grid' | 'status' =
    (localStorage.getItem('ticketLayout') as any) || 'card';
  showFilters = false;
  showColumnPicker = false;
  selectedTicketIds = new Set<string>();
  merging = false;

  filters = {
    status: [] as string[],
    priority: [] as string[],
    category: [] as string[],
    assignedTo: [] as string[],   // user IDs
    groups: [] as string[],       // agent group IDs
    tags: [] as string[],
    search: '',
    dateFrom: '',
    dateTo: ''
  };
  /** Key of the currently open multi-select popover, e.g. 'status'. */
  openFilterMenu: string | null = null;
  /** Set true after first masters-load applies the "all-but-Closed" default. */
  private statusDefaultApplied = false;

  agentOptions: { id: string; name: string }[] = [];
  groupOptions: { id: string; name: string }[] = [];
  categoryOptions: string[] = [];
  tagOptions: string[] = [];

  statusBoardColumns = ['Open', 'InProgress', 'Pending', 'Resolved', 'Closed'];

  statusDropListIds = this.statusBoardColumns
    .map(s => this.getStatusDropListId(s));

  sortBy = 'createdAt';
  sortDir = 'desc';

  private readonly columnVisibilityKey = 'ticketColumns';
  private readonly columnOrderKey = 'ticketColumnOrder';
  private readonly defaultVisibleColumns = [
    'title',
    'status',
    'priority',
    'assignedTo',
    'createdAt',
    'sla'
  ];
  private readonly defaultColumns = [
    { id: 'title', label: 'Title' },
    { id: 'status', label: 'Status' },
    { id: 'priority', label: 'Priority' },
    { id: 'category', label: 'Category' },
    { id: 'assignedTo', label: 'Assigned To' },
    { id: 'ticketType', label: 'Type' },
    { id: 'tags', label: 'Tags' },
    { id: 'sla', label: 'SLA' },
    { id: 'createdAt', label: 'Date' }
  ];

  visibleColumns: string[] = this.loadVisibleColumns();

  allColumns = this.loadColumnOrder();

  visibleColumnDefs = this.computeVisibleColumnDefs();

  statusOptions: TicketMasterOption[] = [];
  priorityOptions: TicketMasterOption[] = [];

  ngOnInit() {
    this.loadMasterOptions();
    this.loadAgentsAndGroups();
    this.loadTickets();
  }

  loadMasterOptions() {
    this.ticketMasterService.getAll(true).subscribe({
      next: (data) => {
        this.statusOptions = data.ticketStatuses || [];
        this.priorityOptions = data.ticketPriorities || [];

        const boardStatuses = this.statusOptions.map(x => x.value);
        if (boardStatuses.length > 0) {
          this.statusBoardColumns = boardStatuses;
          this.statusDropListIds = this.statusBoardColumns
            .map(s => this.getStatusDropListId(s));
        }

        // Default: all statuses checked EXCEPT "Closed".
        if (!this.statusDefaultApplied && this.statusOptions.length > 0) {
          this.filters.status = this.statusOptions
            .map(s => s.value)
            .filter(v => v !== 'Closed');
          this.statusDefaultApplied = true;
          this.applyFilters();
        }

        this.cdr.markForCheck();
      }
    });
  }

  private loadAgentsAndGroups() {
    this.agentService.getAll().pipe(
      takeUntil(this.destroy$),
      catchError(() => of([] as any[]))
    ).subscribe(rows => {
      this.agentOptions = (rows || []).map((r: any) => ({
        id: r.id || r.Id,
        name: r.fullName || r.FullName || r.email || r.Email || 'Agent'
      })).sort((a, b) => a.name.localeCompare(b.name));
      this.cdr.markForCheck();
    });

    this.http.get<any[]>(`${environment.apiUrl}/AgentGroups`).pipe(
      takeUntil(this.destroy$),
      catchError(() => of([] as any[]))
    ).subscribe(rows => {
      this.groupOptions = (rows || []).map((r: any) => ({
        id: r.id || r.Id,
        name: r.name || r.Name || 'Group'
      })).sort((a, b) => a.name.localeCompare(b.name));
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTickets() {
    this.loading = true;
    this.cdr.markForCheck();

    this.http.get<any[]>(`${environment.apiUrl}/Tickets`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.allTickets = data;
          this.recomputeDerivedFilterOptions();
          this.applyFilters();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading = false;
          this.cdr.markForCheck();
          if (err.status === 401) {
            this.authService.logout();
          }
        }
      });
  }

  applyFilters() {
    let result = [...this.allTickets];
    const f = this.filters;

    if (f.status.length > 0)
      result = result.filter(t => f.status.includes(t.status));

    if (f.priority.length > 0)
      result = result.filter(t => f.priority.includes(t.priority));

    if (f.category.length > 0)
      result = result.filter(t =>
        t.category && f.category.includes(t.category));

    if (f.assignedTo.length > 0)
      result = result.filter(t =>
        t.assignedToId && f.assignedTo.includes(t.assignedToId));

    if (f.groups.length > 0)
      result = result.filter(t =>
        t.agentGroupId && f.groups.includes(t.agentGroupId));

    if (f.tags.length > 0) {
      result = result.filter(t => {
        const tt = (t.tags || '').split(',')
          .map((x: string) => x.trim()).filter(Boolean);
        return f.tags.some(tag => tt.includes(tag));
      });
    }

    if (f.search) {
      const q = f.search.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.assignedTo?.toLowerCase().includes(q) ||
        t.createdBy?.toLowerCase().includes(q) ||
        t.tags?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        `tn${t.ticketNumber}`.includes(q) ||
        `#tn${t.ticketNumber}`.includes(q));
    }

    if (f.dateFrom) {
      const from = new Date(f.dateFrom);
      result = result.filter(t => new Date(t.createdAt) >= from);
    }

    if (f.dateTo) {
      const to = new Date(f.dateTo);
      to.setHours(23, 59, 59);
      result = result.filter(t => new Date(t.createdAt) <= to);
    }

    // Sort
    result.sort((a, b) => {
      const valA = a[this.sortBy];
      const valB = b[this.sortBy];
      const dir = this.sortDir === 'asc' ? 1 : -1;
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });

    this.tickets = result;
    this.cdr.markForCheck();
  }

  clearFilters() {
    this.filters = {
      status: [],
      priority: [],
      category: [],
      assignedTo: [],
      groups: [],
      tags: [],
      search: '',
      dateFrom: '',
      dateTo: ''
    };
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    const f = this.filters;
    return !!(
      f.status.length || f.priority.length ||
      f.category.length || f.assignedTo.length ||
      f.groups.length || f.tags.length ||
      f.search || f.dateFrom || f.dateTo
    );
  }

  // ── Multi-select popover helpers ─────────────────────────────
  toggleFilterMenu(key: string, ev?: Event) {
    ev?.stopPropagation();
    this.openFilterMenu = this.openFilterMenu === key ? null : key;
    this.cdr.markForCheck();
  }

  isFilterChecked(key: keyof typeof this.filters, value: string): boolean {
    const arr = this.filters[key] as unknown as string[];
    return Array.isArray(arr) && arr.includes(value);
  }

  toggleFilterValue(key: keyof typeof this.filters, value: string, ev?: Event) {
    ev?.stopPropagation();
    const arr = this.filters[key] as unknown as string[];
    if (!Array.isArray(arr)) return;
    const i = arr.indexOf(value);
    if (i >= 0) arr.splice(i, 1); else arr.push(value);
    this.applyFilters();
  }

  filterSummary(key: 'status' | 'priority' | 'category' |
                       'assignedTo' | 'groups' | 'tags',
                allLabel: string): string {
    const arr = this.filters[key];
    if (!arr.length) return allLabel;
    if (arr.length === 1) {
      if (key === 'assignedTo')
        return this.agentOptions.find(a => a.id === arr[0])?.name || '1 selected';
      if (key === 'groups')
        return this.groupOptions.find(g => g.id === arr[0])?.name || '1 selected';
      if (key === 'status' || key === 'priority') {
        const opt = (key === 'status' ? this.statusOptions : this.priorityOptions)
          .find(o => o.value === arr[0]);
        return opt?.label || arr[0];
      }
      return arr[0];
    }
    return `${arr.length} selected`;
  }

  private recomputeDerivedFilterOptions() {
    const cats = new Set<string>();
    const tags = new Set<string>();
    for (const t of this.allTickets) {
      if (t.category) cats.add(t.category);
      if (t.tags) {
        for (const tag of String(t.tags).split(',')) {
          const v = tag.trim();
          if (v) tags.add(v);
        }
      }
    }
    this.categoryOptions = Array.from(cats).sort((a, b) => a.localeCompare(b));
    this.tagOptions = Array.from(tags).sort((a, b) => a.localeCompare(b));
  }

  /** Two-letter initials for avatar bubbles. */
  initialsFor(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Stable HSL color from an id/name string. */
  colorFor(seed: string): string {
    let h = 0;
    const s = seed || 'x';
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 60%, 52%)`;
  }

  /** Look up an agent's name by id. */
  agentName(id: string): string {
    return this.agentOptions.find(a => a.id === id)?.name || '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (this.showColumnPicker && !target.closest('.col-wrap')) {
      this.showColumnPicker = false;
      this.cdr.markForCheck();
    }
    if (this.openFilterMenu && !target.closest('.f-multi')) {
      this.openFilterMenu = null;
      this.cdr.markForCheck();
    }
  }

  sortBy_(field: string) {
    if (this.sortBy === field)
      this.sortDir =
        this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortBy = field;
      this.sortDir =
        field === 'createdAt' ? 'desc' : 'asc';
    }
    this.applyFilters();
  }

  getSortIcon(field: string): string {
    if (this.sortBy !== field) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  viewTicket(id: string) {
    if (!id) return;
    this.router.navigate(['/tickets', id]);
  }

  openPersonDetails(nameOrEmail: string | null | undefined, ev?: Event) {
    ev?.stopPropagation();
    const q = String(nameOrEmail || '').trim();
    if (!q) return;

    forkJoin({
      contacts: this.http.get<any[]>(`${environment.apiUrl}/Contacts`, {
        params: { search: q }
      }).pipe(catchError(() => of([]))),
      users: this.agentService.getAll().pipe(catchError(() => of([])))
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ contacts, users }) => {
        const matchedContact = this.findContactMatch(contacts, q);
        if (matchedContact?.id) {
          this.router.navigate(['/contacts'], {
            queryParams: {
              contactId: matchedContact.id,
              q: matchedContact.email || q
            }
          });
          return;
        }

        const matchedUser = this.findSystemUserMatch(users, q);
        if (matchedUser?.id) {
          this.router.navigate(['/users', matchedUser.id]);
          return;
        }

        this.router.navigate(['/contacts'], { queryParams: { q } });
      });
  }

  private findContactMatch(contacts: any[], query: string): any | null {
    const q = query.toLowerCase();
    return contacts.find(c => String(c?.email || '').toLowerCase() === q)
      || contacts.find(c => String(c?.fullName || '').toLowerCase() === q)
      || contacts[0]
      || null;
  }

  private findSystemUserMatch(users: any[], query: string): any | null {
    const q = query.toLowerCase();
    return users.find(u => String(u?.email || u?.Email || '').toLowerCase() === q)
      || users.find(u => String(u?.fullName || u?.FullName || '').toLowerCase() === q)
      || null;
  }

  toggleSelect(id: string) {
    if (this.selectedTicketIds.has(id))
      this.selectedTicketIds.delete(id);
    else
      this.selectedTicketIds.add(id);
    this.cdr.markForCheck();
  }

  selectAll() {
    if (this.selectedTicketIds.size ===
        this.tickets.length)
      this.selectedTicketIds.clear();
    else
      this.tickets.forEach(t =>
        this.selectedTicketIds.add(t.id));
    this.cdr.markForCheck();
  }

  // ✅ Layout save
  setLayout(layout: 'card' | 'table' | 'grid' | 'status') {
    this.currentLayout = layout;
    localStorage.setItem('ticketLayout', layout);
    this.cdr.markForCheck();
  }

  getStatusDropListId(status: string): string {
    return `status-col-${status.toLowerCase()}`;
  }

  getTicketsForStatus(status: string): any[] {
    return this.tickets.filter(t => t.status === status);
  }

  onStatusDrop(
    event: CdkDragDrop<any[]>,
    status: string
  ) {
    const movedTicket = event.item?.data;
    if (!movedTicket || movedTicket.status === status) {
      return;
    }

    const previousStatus = movedTicket.status;

    // Optimistic UI update for smoother drag-drop UX.
    movedTicket.status = status;
    this.applyFilters();

    this.http.put(
      `${environment.apiUrl}/Tickets/${movedTicket.id}/status`,
      { status }
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success(
            `#TN${movedTicket.ticketNumber} moved to ${status}`
          )
        );
        this.cdr.markForCheck();
      },
      error: () => {
        movedTicket.status = previousStatus;
        this.applyFilters();
        Promise.resolve().then(() =>
          this.toastr.error('Status change failed')
        );
      }
    });
  }

  isColumnVisible(colId: string): boolean {
    return this.visibleColumns.includes(colId);
  }

  trackColumn(_: number, col: { id: string }): string {
    return col.id;
  }

  onColumnDrop(event: CdkDragDrop<Array<{ id: string; label: string }>>) {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.allColumns, event.previousIndex, event.currentIndex);
    this.persistColumnOrder();
    this.syncVisibleColumnDefs();
    this.cdr.markForCheck();
  }

  isSortableColumn(colId: string): boolean {
    return colId === 'title'
      || colId === 'status'
      || colId === 'priority'
      || colId === 'createdAt';
  }

  onColumnHeaderClick(colId: string) {
    if (!this.isSortableColumn(colId)) {
      return;
    }
    this.sortBy_(colId);
  }

  toggleColumn(colId: string) {
    const idx = this.visibleColumns.indexOf(colId);
    if (idx > -1) {
      if (this.visibleColumns.length > 2)
        this.visibleColumns.splice(idx, 1);
    } else {
      this.visibleColumns.push(colId);
    }
    this.persistVisibleColumns();
    this.syncVisibleColumnDefs();
    this.cdr.markForCheck();
  }

  private loadVisibleColumns(): string[] {
    const validIds = new Set(this.defaultColumns.map(c => c.id));
    const saved = localStorage.getItem(this.columnVisibilityKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const normalized = parsed.filter(
            (colId): colId is string => typeof colId === 'string' && validIds.has(colId)
          );

          if (normalized.length > 0) {
            return normalized;
          }
        }
      } catch {}
    }

    return [...this.defaultVisibleColumns];
  }

  private loadColumnOrder(): Array<{ id: string; label: string }> {
    const saved = localStorage.getItem(this.columnOrderKey);
    const lookup = new Map(this.defaultColumns.map(col => [col.id, col]));

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const idsInOrder = parsed.filter(
            (colId): colId is string => typeof colId === 'string' && lookup.has(colId)
          );

          const missingIds = this.defaultColumns
            .map(col => col.id)
            .filter(id => !idsInOrder.includes(id));

          return [...idsInOrder, ...missingIds]
            .map(id => lookup.get(id) as { id: string; label: string });
        }
      } catch {}
    }

    return [...this.defaultColumns];
  }

  private computeVisibleColumnDefs(): Array<{ id: string; label: string }> {
    return this.allColumns.filter(col => this.visibleColumns.includes(col.id));
  }

  private syncVisibleColumnDefs() {
    this.visibleColumnDefs = this.computeVisibleColumnDefs();
  }

  private persistVisibleColumns() {
    localStorage.setItem(this.columnVisibilityKey, JSON.stringify(this.visibleColumns));
  }

  private persistColumnOrder() {
    localStorage.setItem(
      this.columnOrderKey,
      JSON.stringify(this.allColumns.map(col => col.id))
    );
  }

  getTagsArr(tags: string): string[] {
    if (!tags || !tags.trim()) return [];
    return tags.split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .slice(0, 3);
  }

  getStatusColor(s: string): string {
    const c: any = {
      'Open': '#22c55e',
      'InProgress': '#f59e0b',
      'Pending': '#3b82f6',
      'Resolved': '#8b5cf6',
      'Closed': '#6b7280'
    };
    return c[s] || '#6b7280';
  }

  getPriorityColor(p: string): string {
    const c: any = {
      'Low': '#22c55e',
      'Medium': '#3b82f6',
      'High': '#f59e0b',
      'Critical': '#ef4444'
    };
    return c[p] || '#6b7280';
  }

  getSlaColor(s: string): string {
    const c: any = {
      'OnTrack': '#22c55e',
      'Warning': '#f59e0b',
      'Critical': '#ef4444',
      'Breached': '#dc2626'
    };
    return c[s] || '#9ca3af';
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff =
      now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6',
      '#8b5cf6', '#ec4899'
    ];
    const idx =
      (name?.charCodeAt(0) || 0)
        % colors.length;
    return colors[idx];
  }

  // ✅ ADD TO TODO
  addSelectedToTodo() {
    const selected = this.tickets.filter(t =>
      this.selectedTicketIds.has(t.id));

    if (!selected.length) {
      Promise.resolve().then(() =>
        this.toastr.warning(
          'Select at least one ticket')
      );
      return;
    }

    const promises = selected.map(t =>
      this.http.post(
        `${environment.apiUrl}/Todo`,
        {
          title: t.title,
          ticketNumber:
            t.ticketNumber?.toString(),
          ticketId: t.id
        }
      ).toPromise()
    );

    Promise.all(promises).then(() => {
      Promise.resolve().then(() =>
        this.toastr.success(
          `${selected.length} ticket(s)` +
          ` added to To-Do!`)
      );
      this.selectedTicketIds.clear();
      this.cdr.markForCheck();
    }).catch(() => {
      Promise.resolve().then(() =>
        this.toastr.error('Failed to add to To-Do')
      );
    });
  }

  async mergeBulk() {
    const ids = Array.from(this.selectedTicketIds);

    if (ids.length < 2) {
      Promise.resolve().then(() =>
        this.toastr.warning(
          'Select at least 2 tickets to merge')
      );
      return;
    }

    const masterTicket = this.tickets.find(
      t => t.id === ids[0]);
    const duplicateIds = ids.slice(1);

    const confirmed = confirm(
      `Merge ${duplicateIds.length} ticket(s) ` +
      `into #TN${masterTicket?.ticketNumber}` +
      ` — "${masterTicket?.title}"?\n\n` +
      `Duplicate tickets will be CLOSED.`
    );
    if (!confirmed) return;

    this.merging = true;
    this.cdr.markForCheck();

    let successCount = 0;
    let failCount = 0;

    for (const dupId of duplicateIds) {
      try {
        await this.http.post(
          `${environment.apiUrl}/Tickets` +
          `/${ids[0]}/merge`,
          { duplicateTicketId: dupId }
        ).toPromise();
        successCount++;
      } catch {
        failCount++;
      }
    }

    this.merging = false;
    this.selectedTicketIds.clear();

    if (successCount > 0) {
      Promise.resolve().then(() =>
        this.toastr.success(
          `${successCount} ticket(s) merged ` +
          `into #TN${masterTicket?.ticketNumber}!`)
      );
      this.loadTickets();
    }
    if (failCount > 0) {
      Promise.resolve().then(() =>
        this.toastr.error(
          `${failCount} merge(s) failed`)
      );
    }

    this.cdr.markForCheck();
  }

  exportCsv() {
    // Always export the *currently visible* (filtered + sorted) list.
    const data = this.tickets;

    const headers = [
      '#', 'Title', 'Status', 'Priority', 'Category',
      'Assigned To', 'Tags', 'SLA Status', 'SLA Deadline',
      'Created By', 'Created At'
    ];
    const rows = data.map(t => [
      `#TN${t.ticketNumber}`,
      t.title || '',
      t.status || '',
      t.priority || '',
      t.category || '',
      t.assignedTo || 'Unassigned',
      t.tags || '',
      t.slaStatus || '',
      t.slaDeadline ? new Date(t.slaDeadline).toLocaleString() : '',
      t.createdBy || '',
      t.createdAt ? new Date(t.createdAt).toLocaleString() : ''
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(
        v => `"${(v ?? '').toString().replace(/"/g, '""')}"`
      ).join(','))
      .join('\r\n');

    // UTF-8 BOM so Excel opens non-ASCII (Hindi/emoji/accents) correctly.
    const blob = new Blob(
      ['\uFEFF' + csv],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tag = this.hasActiveFilters() ? 'filtered' : 'all';
    a.download = `tickets-${tag}-${data.length}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.toastr.success(
      `Exported ${data.length} ticket${data.length === 1 ? '' : 's'}` +
      (this.hasActiveFilters() ? ' (filtered)' : '')
    );
  }
}