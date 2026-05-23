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
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../../environments/environment';


@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
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
  private destroy$ = new Subject<void>();

  allTickets: any[] = [];
  tickets: any[] = [];
  loading = true;
  currentLayout: 'card' | 'table' | 'grid' =
    (localStorage.getItem('ticketLayout') as any) || 'card';
  showFilters = false;
  showColumnPicker = false;
  selectedTicketIds = new Set<string>();
  merging = false;

  filters = {
    status: '',
    priority: '',
    category: '',
    assignedTo: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  };

  sortBy = 'createdAt';
  sortDir = 'desc';

  visibleColumns: string[] = (() => {
    const saved = localStorage.getItem('ticketColumns');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return ['title', 'status', 'priority', 'assignedTo', 'createdAt', 'sla'];
  })();

  allColumns = [
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

  statusOptions = [
    'Open', 'InProgress', 'Pending',
    'Resolved', 'Closed'
  ];

  priorityOptions = [
    'Low', 'Medium', 'High', 'Critical'
  ];

  ngOnInit() {
    this.loadTickets();
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

    if (this.filters.status)
      result = result.filter(t =>
        t.status === this.filters.status);

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
  setLayout(layout: 'card' | 'table' | 'grid') {
    this.currentLayout = layout;
    localStorage.setItem('ticketLayout', layout);
    this.cdr.markForCheck();
  }

  isColumnVisible(colId: string): boolean {
    return this.visibleColumns.includes(colId);
  }

  toggleColumn(colId: string) {
    const idx = this.visibleColumns.indexOf(colId);
    if (idx > -1) {
      if (this.visibleColumns.length > 2)
        this.visibleColumns.splice(idx, 1);
    } else {
      this.visibleColumns.push(colId);
    }
    // ✅ Save columns to localStorage
    localStorage.setItem('ticketColumns',
      JSON.stringify(this.visibleColumns));
    this.cdr.markForCheck();
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