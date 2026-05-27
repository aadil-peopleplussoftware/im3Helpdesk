import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject,
  ChangeDetectionStrategy
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
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../../environments/environment';
import { TicketMasterOption, TicketMasterService } from '../../../core/services/ticket-master';


@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DragDropModule,
    LayoutComponent
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
  private ticketMasterService = inject(TicketMasterService);
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
    status: '',
    includeClosed: false,
    priority: '',
    category: '',
    assignedTo: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  };

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

        this.cdr.markForCheck();
      }
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
    const hasSearch =
      this.filters.search.trim().length > 0;
    const includeClosed =
      this.filters.includeClosed || hasSearch;

    if (this.filters.status)
      result = result.filter(t =>
        t.status === this.filters.status);
    else if (!includeClosed)
      result = result.filter(t =>
        t.status !== 'Closed');

    if (this.filters.priority)
      result = result.filter(t =>
        t.priority === this.filters.priority);

    if (this.filters.category)
      result = result.filter(t =>
        t.category?.toLowerCase().includes(
          this.filters.category.toLowerCase()));

    if (this.filters.assignedTo)
      result = result.filter(t =>
        t.assignedTo?.toLowerCase().includes(
          this.filters.assignedTo.toLowerCase()));

    if (this.filters.search) {
      const q =
        this.filters.search.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.assignedTo?.toLowerCase().includes(q) ||
        t.createdBy?.toLowerCase().includes(q) ||
        t.tags?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        `tn${t.ticketNumber}`.includes(q) ||
        `#tn${t.ticketNumber}`.includes(q));
    }

    if (this.filters.dateFrom) {
      const from =
        new Date(this.filters.dateFrom);
      result = result.filter(t =>
        new Date(t.createdAt) >= from);
    }

    if (this.filters.dateTo) {
      const to = new Date(this.filters.dateTo);
      to.setHours(23, 59, 59);
      result = result.filter(t =>
        new Date(t.createdAt) <= to);
    }

    // Sort
    result.sort((a, b) => {
      const valA = a[this.sortBy];
      const valB = b[this.sortBy];
      const dir =
        this.sortDir === 'asc' ? 1 : -1;
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });

    this.tickets = result;
    this.cdr.markForCheck();
  }

  clearFilters() {
    this.filters = {
      status: '',
      includeClosed: false,
      priority: '',
      category: '',
      assignedTo: '',
      search: '',
      dateFrom: '',
      dateTo: ''
    };
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return Object.values(this.filters)
      .some(v => v !== '');
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
    const headers = [
      '#', 'Title', 'Status', 'Priority',
      'Category', 'Assigned', 'Created'
    ];
    const rows = this.tickets.map(t => [
      `#TN${t.ticketNumber}`,
      t.title,
      t.status,
      t.priority,
      t.category,
      t.assignedTo || 'Unassigned',
      new Date(t.createdAt).toLocaleDateString()
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(
        v => `"${(v || '').toString()
          .replace(/"/g, '""')}"`
      ).join(','))
      .join('\n');

    const blob = new Blob([csv],
      { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      `tickets-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}