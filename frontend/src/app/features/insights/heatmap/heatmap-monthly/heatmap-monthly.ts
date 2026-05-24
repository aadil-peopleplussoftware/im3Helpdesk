import { Component, Input, OnChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';

type MonthlyPoint = {
  date: string; // yyyy-MM-dd
  count: number;
};

type TicketLite = {
  id: string;
  title: string;
  status: string;
  priority: string;
  ticketNumber: number;
  createdAt: string;
};

@Component({
  selector: 'app-heatmap-monthly',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './heatmap-monthly.html',
  styleUrls: ['./heatmap-monthly.scss']
})
export class HeatmapMonthlyComponent implements OnChanges {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  public router = inject(Router);

  @Input() data: MonthlyPoint[] = [];
  @Input() maxCount = 0;
  @Input() totalMonth = 0;
  @Input() month = ''; // startDate from parent

  @Input() priority = 'All';
  @Input() agentId = 'All';
  @Input() type = 'All';

  monthLabel = '';
  weeks: Array<Array<{ date: Date | null; ymd: string; count: number }>> = [];

  selectedYmd = '';
  monthTickets: TicketLite[] = [];
  dayTickets: TicketLite[] = [];
  loadingTickets = false;

  ngOnChanges() {
    const dt = this.parseYmd(this.month) ?? new Date();
    const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
    this.monthLabel = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    this.buildCalendar(start);
    this.loadMonthTickets(start);
  }

  private buildCalendar(monthStart: Date) {
    const month = monthStart.getMonth();
    const year = monthStart.getFullYear();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstDow = firstDay.getDay(); // Sun=0
    const startCell = new Date(firstDay);
    startCell.setDate(firstDay.getDate() - firstDow);

    const counts = new Map<string, number>();
    for (const p of this.data) counts.set(p.date, p.count ?? 0);

    const weeks: Array<Array<{ date: Date | null; ymd: string; count: number }>> = [];

    let cursor = new Date(startCell);
    for (let w = 0; w < 6; w++) {
      const row: Array<{ date: Date | null; ymd: string; count: number }> = [];
      for (let d = 0; d < 7; d++) {
        const inMonth = cursor.getMonth() === month;
        const ymd = this.toYmd(cursor);
        row.push({
          date: inMonth ? new Date(cursor) : null,
          ymd: inMonth ? ymd : '',
          count: inMonth ? (counts.get(ymd) ?? 0) : 0
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(row);

      // stop after we've passed the month and we're on a Sunday row
      const lastRowHasMonth = row.some(c => c.date != null);
      const passed = cursor > lastDay && !lastRowHasMonth;
      if (passed) break;
    }

    this.weeks = weeks;
  }

  getCellColor(count: number, maxCount: number): string {
    if (count === 0) return 'var(--ui-color-bg-subtle)';

    const intensity = maxCount === 0 ? 0 : count / maxCount;
    if (intensity < 0.25) return 'rgba(var(--ui-color-primary-rgb), 0.25)';
    if (intensity < 0.50) return 'rgba(var(--ui-color-primary-rgb), 0.50)';
    if (intensity < 0.75) return 'rgba(var(--ui-color-primary-rgb), 0.75)';
    return 'var(--ui-color-primary)';
  }

  selectDay(cell: { ymd: string; count: number }) {
    if (!cell.ymd) return;
    this.selectedYmd = cell.ymd;
    this.dayTickets = this.monthTickets
      .filter(t => (t.createdAt || '').startsWith(cell.ymd))
      .slice(0, 50);
    this.cdr.detectChanges();
  }

  goToTicket(id: string) {
    this.router.navigate(['/tickets', id]);
  }

  private loadMonthTickets(monthStart: Date) {
    this.loadingTickets = true;
    this.monthTickets = [];
    this.dayTickets = [];
    this.selectedYmd = '';
    this.cdr.detectChanges();

    this.http.get<any[]>(`${environment.apiUrl}/Tickets`).subscribe({
      next: (data) => {
        const month = monthStart.getMonth();
        const year = monthStart.getFullYear();

        const list = (data || []) as any[];
        this.monthTickets = list
          .filter(t => {
            const d = new Date(t.createdAt);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            ticketNumber: t.ticketNumber,
            createdAt: t.createdAt
          }));

        this.loadingTickets = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingTickets = false;
        this.cdr.detectChanges();
      }
    });
  }

  private toYmd(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseYmd(ymd: string): Date | null {
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
}
