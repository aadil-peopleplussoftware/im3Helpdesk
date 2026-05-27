import {
  Component, OnInit,
  ChangeDetectorRef, inject,
  ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';
import { HeatmapHourlyComponent } from './heatmap-hourly/heatmap-hourly';
import { HeatmapDailyComponent } from './heatmap-daily/heatmap-daily';
import { HeatmapMonthlyComponent } from './heatmap-monthly/heatmap-monthly';
import { HeatmapInsightsComponent } from './heatmap-insights/heatmap-insights';
import { TicketMasterService } from '../../../core/services/ticket-master';

type HeatmapTab = 'hourly' | 'daily' | 'monthly';

type HourlyPoint = {
  dayOfWeek: number; // Monday=1..Sunday=7
  hour: number; // 0..23
  count: number;
};

type DailyPoint = {
  date: string; // yyyy-MM-dd
  count: number;
  dayName: string;
};

type MonthlyPoint = {
  date: string; // yyyy-MM-dd
  count: number;
};

type AgentOption = {
  id: string;
  fullName: string;
};

type InsightsModel = {
  peakDayLabel: string;
  peakDayAvgPerWeekLabel: string;
  peakHourLabel: string;
  peakHourOccursPctLabel: string;
  avgPerDayLabel: string;
  avgPerDayCompareLabel: string;
  busiestWeekLabel: string;
  busiestWeekTotalLabel: string;
  staffingBullets: string[];
};

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LayoutComponent,
    HeatmapHourlyComponent,
    HeatmapDailyComponent,
    HeatmapMonthlyComponent,
    HeatmapInsightsComponent
  ],
  templateUrl: './heatmap.html',
  styleUrls: ['./heatmap.scss']
})
export class HeatmapComponent implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private ticketMasterService = inject(TicketMasterService);

  @ViewChild('exportArea')
  exportAreaRef!: ElementRef;

  activeTab: HeatmapTab = 'hourly';

  // Filters (shared across all 3 views)
  dateRange = 'Last 7 Days';
  startDate = '';
  endDate = '';
  priority = 'All';
  agentId = 'All';
  type = 'All';

  dateRangeOptions = [
    'Today',
    'Last 7 Days',
    'Last 30 Days',
    'Last 3 Months',
    'Custom'
  ];

  priorityOptions = ['All', 'Low', 'Medium', 'High', 'Critical'];

  typeOptions = [
    'All',
    'Email',
    'Manual',
    'Chat'
  ];

  agents: AgentOption[] = [];

  // Data
  hourly: HourlyPoint[] = [];
  daily: DailyPoint[] = [];
  monthly: MonthlyPoint[] = [];
  monthlyMaxCount = 0;
  monthlyTotal = 0;

  // Meta
  loading = false;
  exporting = false;

  // Insights
  insights: InsightsModel | null = null;

  private readonly BASE = environment.baseUrl;

  ngOnInit() {
    this.applyPreset('Last 7 Days');
    this.loadPriorities();
    this.loadAgents();
    this.reloadAll();
  }

  private loadPriorities() {
    this.ticketMasterService.getAll(true).subscribe({
      next: (data) => {
        const values = (data.ticketPriorities || []).map(x => x.value);
        this.priorityOptions = ['All', ...values];
        this.cdr.detectChanges();
      }
    });
  }

  setTab(tab: HeatmapTab) {
    this.activeTab = tab;
  }

  onDateRangeChange() {
    if (this.dateRange === 'Custom') {
      // Keep current values; user will set dates.
      return;
    }
    this.applyPreset(this.dateRange);
    this.reloadAll();
  }

  applyQuick(preset: 'Today' | 'This Week' | 'This Month' | 'Last 3 Months') {
    if (preset === 'Today') {
      this.applyPreset('Today');
      this.dateRange = 'Today';
    }
    if (preset === 'This Week') {
      const now = new Date();
      const day = now.getDay(); // 0=Sun
      const mondayOffset = (day + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - mondayOffset);
      this.startDate = this.toYmd(monday);
      this.endDate = this.toYmd(now);
      this.dateRange = 'Custom';
    }
    if (preset === 'This Month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      this.startDate = this.toYmd(start);
      this.endDate = this.toYmd(now);
      this.dateRange = 'Custom';
    }
    if (preset === 'Last 3 Months') {
      this.applyPreset('Last 3 Months');
      this.dateRange = 'Last 3 Months';
    }

    this.reloadAll();
  }

  onCustomDatesChange() {
    if (this.dateRange !== 'Custom') return;
    if (!this.startDate || !this.endDate) return;
    this.reloadAll();
  }

  onOtherFilterChange() {
    this.reloadAll();
  }

  private applyPreset(preset: string) {
    const now = new Date();

    if (preset === 'Today') {
      this.startDate = this.toYmd(now);
      this.endDate = this.toYmd(now);
      return;
    }

    if (preset === 'Last 7 Days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      this.startDate = this.toYmd(start);
      this.endDate = this.toYmd(now);
      return;
    }

    if (preset === 'Last 30 Days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      this.startDate = this.toYmd(start);
      this.endDate = this.toYmd(now);
      return;
    }

    if (preset === 'Last 3 Months') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      this.startDate = this.toYmd(start);
      this.endDate = this.toYmd(now);
      return;
    }
  }

  private loadAgents() {
    this.http.get<any[]>(`${environment.apiUrl}/Agents`).subscribe({
      next: (data) => {
        this.agents = (data || []).map(a => ({
          id: a.id,
          fullName: a.fullName
        }));
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private buildParams(extra: Record<string, string> = {}) {
    let p = new HttpParams();
    if (this.startDate) p = p.set('startDate', this.startDate);
    if (this.endDate) p = p.set('endDate', this.endDate);
    if (this.priority && this.priority !== 'All') p = p.set('priority', this.priority);
    if (this.type && this.type !== 'All') p = p.set('type', this.type);
    if (this.agentId && this.agentId !== 'All') p = p.set('agentId', this.agentId);

    for (const [k, v] of Object.entries(extra)) {
      p = p.set(k, v);
    }
    return p;
  }

  reloadAll() {
    this.loading = true;
    this.insights = null;
    this.cdr.detectChanges();

    const params = this.buildParams();

    const monthInfo = this.monthFromStartDate();
    const monthlyParams = this.buildParams({
      month: String(monthInfo.month),
      year: String(monthInfo.year)
    });

    let pending = 3;
    const done = () => {
      pending--;
      if (pending <= 0) {
        this.loading = false;
        this.computeInsights();
        this.cdr.detectChanges();
      }
    };

    this.http.get<any>(`${this.BASE}/api/analytics/heatmap/hourly`, { params }).subscribe({
      next: (res) => {
        this.hourly = res?.data || [];
        done();
      },
      error: () => { this.hourly = []; done(); }
    });

    this.http.get<any>(`${this.BASE}/api/analytics/heatmap/daily`, { params }).subscribe({
      next: (res) => {
        this.daily = res?.data || [];
        done();
      },
      error: () => { this.daily = []; done(); }
    });

    this.http.get<any>(`${this.BASE}/api/analytics/heatmap/monthly`, { params: monthlyParams }).subscribe({
      next: (res) => {
        this.monthly = res?.data || [];
        this.monthlyMaxCount = res?.maxCount ?? 0;
        this.monthlyTotal = res?.totalMonth ?? 0;
        done();
      },
      error: () => { this.monthly = []; this.monthlyMaxCount = 0; this.monthlyTotal = 0; done(); }
    });
  }

  private computeInsights() {
    const start = this.parseYmd(this.startDate) ?? new Date();
    const end = this.parseYmd(this.endDate) ?? new Date();
    const daysInRange = Math.max(1, this.diffDaysInclusive(start, end));

    // Peak Day
    const byDay = new Map<number, number>();
    for (const p of this.hourly) {
      byDay.set(p.dayOfWeek, (byDay.get(p.dayOfWeek) ?? 0) + (p.count ?? 0));
    }
    const peakDayEntry = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const peakDayNum = peakDayEntry?.[0] ?? 1;
    const peakDayTotal = peakDayEntry?.[1] ?? 0;
    const weeks = Math.max(1, daysInRange / 7);
    const peakDayAvgPerWeek = peakDayTotal / weeks;

    // Peak Hour
    const byHour = new Map<number, number>();
    for (const p of this.hourly) {
      byHour.set(p.hour, (byHour.get(p.hour) ?? 0) + (p.count ?? 0));
    }
    const peakHourEntry = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
    const peakHour = peakHourEntry?.[0] ?? 10;

    // Occurs % of weekdays (Mon-Fri) within the selected range
    const weekdaySet = new Set<number>();
    for (const d of this.daily) {
      const dt = this.parseYmd(d.date);
      if (!dt) continue;
      const dow = this.toMondayFirst1to7(dt);
      if (dow >= 1 && dow <= 5) weekdaySet.add(dow);
    }
    const weekdayCount = Math.max(1, weekdaySet.size);

    let occursWeekdays = 0;
    for (const dow of weekdaySet.values()) {
      const sum = this.hourly
        .filter(x => x.dayOfWeek === dow && x.hour === peakHour)
        .reduce((acc, x) => acc + (x.count ?? 0), 0);
      if (sum > 0) occursWeekdays++;
    }
    const occursPct = Math.round((occursWeekdays / weekdayCount) * 100);

    // Avg/day + comparison to previous period (same length immediately before)
    const totalTickets = this.daily.reduce((acc, x) => acc + (x.count ?? 0), 0);
    const avgPerDay = totalTickets / daysInRange;

    const compare = {
      label: 'vs prev period —',
      pctLabel: ''
    };

    // compute busiest week from daily data (Monday-first week buckets)
    const weekTotals = new Map<string, { start: Date; end: Date; total: number }>();
    for (const d of this.daily) {
      const dt = this.parseYmd(d.date);
      if (!dt) continue;
      const weekStart = this.startOfWeekMonday(dt);
      const key = this.toYmd(weekStart);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const existing = weekTotals.get(key);
      if (!existing) {
        weekTotals.set(key, { start: weekStart, end: weekEnd, total: d.count ?? 0 });
      } else {
        existing.total += d.count ?? 0;
      }
    }

    const busiestWeek = [...weekTotals.values()].sort((a, b) => b.total - a.total)[0];
    const busiestWeekLabel = busiestWeek
      ? `${this.monthShort(busiestWeek.start)} ${busiestWeek.start.getDate()}–${busiestWeek.end.getDate()}`
      : '';

    // Staffing bullets (derived, but kept simple and deterministic)
    const topDays = [...byDay.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([dow]) => this.dayName(dow));

    const topHours = [...byHour.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([h]) => h)
      .sort((a, b) => a - b);

    const topHourRange = topHours.length
      ? `${this.formatHourRange(topHours[0])}${topHours.length > 1 ? `, ${this.formatHourRange(topHours[1])}` : ''}`
      : '';

    const weekendTotal = (byDay.get(6) ?? 0) + (byDay.get(7) ?? 0);
    const weekdayTotal = (byDay.get(1) ?? 0) + (byDay.get(2) ?? 0) + (byDay.get(3) ?? 0) + (byDay.get(4) ?? 0) + (byDay.get(5) ?? 0);

    const staffingBullets: string[] = [
      topDays.length ? `Schedule more agents on ${topDays.join(' & ')}` : 'Schedule more agents on peak weekdays',
      topHourRange ? `Peak hours ${topHourRange} need full team coverage` : 'Peak hours need full team coverage',
      weekendTotal < weekdayTotal * 0.25 ? 'Saturday & Sunday can run with minimal staff' : 'Weekend staffing can be lighter than weekdays',
      'Consider automation for 12 AM–6 AM slot'
    ];

    // Kick off previous-period comparison asynchronously (non-blocking)
    this.loadAvgCompare(daysInRange, avgPerDay);

    this.insights = {
      peakDayLabel: `${this.dayName(peakDayNum)}`,
      peakDayAvgPerWeekLabel: `avg ${peakDayAvgPerWeek.toFixed(1)}/week`,
      peakHourLabel: `${this.formatHourRange(peakHour)}`,
      peakHourOccursPctLabel: `occurs ${occursPct}% of weekdays`,
      avgPerDayLabel: `${avgPerDay.toFixed(1)} tickets`,
      avgPerDayCompareLabel: compare.label,
      busiestWeekLabel,
      busiestWeekTotalLabel: busiestWeek ? `${busiestWeek.total} total` : '',
      staffingBullets
    };
  }

  private loadAvgCompare(daysInRange: number, currentAvg: number) {
    const start = this.parseYmd(this.startDate);
    const end = this.parseYmd(this.endDate);
    if (!start || !end) return;

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (daysInRange - 1));

    const prevParams = this.buildParams();
    // override date params
    let p = prevParams;
    p = p.set('startDate', this.toYmd(prevStart));
    p = p.set('endDate', this.toYmd(prevEnd));

    this.http.get<any>(`${this.BASE}/api/analytics/heatmap/daily`, { params: p }).subscribe({
      next: (res) => {
        const prevDaily: DailyPoint[] = res?.data || [];
        const prevTotal = prevDaily.reduce((acc, x) => acc + (x.count ?? 0), 0);
        const prevAvg = prevTotal / Math.max(1, daysInRange);

        const delta = currentAvg - prevAvg;
        const pct = prevAvg === 0 ? 0 : (delta / prevAvg) * 100;
        const arrow = delta >= 0 ? '↑' : '↓';
        const pctAbs = Math.abs(pct);

        if (this.insights) {
          this.insights = {
            ...this.insights,
            avgPerDayCompareLabel: `vs prev period ${arrow}${pctAbs.toFixed(0)}%`
          };
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  async exportPng() {
    if (!this.exportAreaRef?.nativeElement) return;
    this.exporting = true;
    this.cdr.detectChanges();

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(this.exportAreaRef.nativeElement, {
        backgroundColor: null,
        scale: 2
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-heatmap-${Date.now()}.png`;
      a.click();
    } finally {
      this.exporting = false;
      this.cdr.detectChanges();
    }
  }

  async exportPdf() {
    if (!this.exportAreaRef?.nativeElement) return;
    this.exporting = true;
    this.cdr.detectChanges();

    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(this.exportAreaRef.nativeElement, {
        backgroundColor: null,
        scale: 2
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Fit image to page with margins
      const margin = 24;
      const maxW = pageWidth - margin * 2;
      const maxH = pageHeight - margin * 2;

      const imgW = canvas.width;
      const imgH = canvas.height;
      const scale = Math.min(maxW / imgW, maxH / imgH);
      const w = imgW * scale;
      const h = imgH * scale;

      pdf.addImage(imgData, 'PNG', margin, margin, w, h);
      pdf.save(`ticket-heatmap-${Date.now()}.pdf`);
    } finally {
      this.exporting = false;
      this.cdr.detectChanges();
    }
  }

  // Helpers
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

  private diffDaysInclusive(a: Date, b: Date) {
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    const ms = end.getTime() - start.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
  }

  private monthFromStartDate() {
    const dt = this.parseYmd(this.startDate) ?? new Date();
    return { month: dt.getMonth() + 1, year: dt.getFullYear() };
  }

  private toMondayFirst1to7(dt: Date) {
    const d = dt.getDay();
    return ((d + 6) % 7) + 1;
  }

  private dayName(dayOfWeek: number) {
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Math.max(0, Math.min(6, dayOfWeek - 1))];
  }

  private formatHourRange(hour: number) {
    const start = this.formatHour(hour);
    const end = this.formatHour((hour + 1) % 24);
    return `${start}–${end}`;
  }

  private formatHour(hour: number) {
    const dt = new Date(2000, 0, 1, hour, 0, 0);
    return dt.toLocaleString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '');
  }

  private startOfWeekMonday(dt: Date) {
    const d = new Date(dt);
    const day = d.getDay();
    const mondayOffset = (day + 6) % 7;
    d.setDate(d.getDate() - mondayOffset);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private monthShort(dt: Date) {
    return dt.toLocaleString('en-US', { month: 'short' });
  }
}
