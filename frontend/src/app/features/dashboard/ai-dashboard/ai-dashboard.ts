import {
  Component, OnInit,
  ChangeDetectorRef, inject,
  ViewChildren, QueryList,
  ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient }
  from '@angular/common/http';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import Chart from 'chart.js/auto';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-ai-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LayoutComponent
  ],
  templateUrl: './ai-dashboard.html',
  styleUrls: ['./ai-dashboard.scss']
})
export class AIDashboardComponent
  implements OnInit, AfterViewInit {

  private http = inject(HttpClient);
  public router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChildren('tideChart')
    tideChartRefs!: QueryList<ElementRef>;

  activeTab:
    'tide' | 'insights' |
    'duplicates' | 'summary' = 'tide';

  // ── Tide ────────────────────────────
  tideData: any = null;
  tideLoading = true;
  selectedDayIndex = 0;
  tideCharts: Chart[] = [];

  // ── Insights ────────────────────────
  insightsData: any = null;
  insightsLoading = true;

  // ── Duplicates ──────────────────────
  duplicatesData: any = null;
  duplicatesLoading = true;
  mergingGroup: any = null;
  mergeLoading = false;
  mergeSuccess = '';

  // ── Summary ─────────────────────────
  summaryTicketId = '';
  summaryData: any = null;
  summaryLoading = false;
  recentTickets: any[] = [];

  private readonly BASE = environment.baseUrl;

  ngOnInit() {
    this.loadTide();
    this.loadInsights();
    this.loadDuplicates();
    this.loadRecentTickets();
  }

  ngAfterViewInit() {}

  // ── TAB ─────────────────────────────
  setTab(t: typeof this.activeTab) {
    this.activeTab = t;
    this.cdr.detectChanges();
    if (t === 'tide')
      setTimeout(() =>
        this.renderTideChart(), 300);
  }

  // ── TIDE ────────────────────────────
  loadTide() {
    this.tideLoading = true;
    this.http.get<any>(
      `${this.BASE}/api/AIFeatures` +
      `/tide-forecast?days=7`
    ).subscribe({
      next: (d) => {
        this.tideData = d;
        this.tideLoading = false;
        this.cdr.detectChanges();
        setTimeout(() =>
          this.renderTideChart(), 300);
      },
      error: () => {
        this.tideLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  renderTideChart() {
    this.tideCharts.forEach(
      c => { try { c.destroy(); } catch {} });
    this.tideCharts = [];

    if (!this.tideData?.forecast?.length)
      return;

    const day =
      this.tideData.forecast[
        this.selectedDayIndex];
    if (!day) return;

    const canvas = document.getElementById(
      'tideMainChart') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = day.hourly.map(
      (h: any) => h.label);
    const data = day.hourly.map(
      (h: any) => h.predicted);
    const maxVal = Math.max(...data);

    // Color based on tide level
    const colors = data.map((v: number) => {
      const pct = maxVal > 0
        ? v / maxVal : 0;
      if (pct > 0.8)
        return 'rgba(239, 68, 68, 0.8)';
      if (pct > 0.5)
        return 'rgba(245, 158, 11, 0.8)';
      return 'rgba(59, 130, 246, 0.8)';
    });

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Predicted Tickets',
          data,
          backgroundColor: colors,
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                ` ${c.raw} tickets predicted`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#e8ecf0' },
            ticks: {
              font: { size: 11 },
              stepSize: 1
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          }
        }
      }
    });

    this.tideCharts.push(chart);
  }

  selectDay(i: number) {
    this.selectedDayIndex = i;
    this.cdr.detectChanges();
    setTimeout(() =>
      this.renderTideChart(), 100);
  }

  getTideColor(level: string): string {
    if (level === 'High') return '#ef4444';
    if (level === 'Medium') return '#f59e0b';
    return '#22c55e';
  }

  getTideIcon(level: string): string {
    if (level === 'High') return '🌊';
    if (level === 'Medium') return '🌀';
    return '💧';
  }

  getTideHeight(
    predicted: number,
    max: number): string {
    if (!max) return '20%';
    return `${Math.max(
      20, (predicted / max) * 100)}%`;
  }

  getMaxForecast(): number {
    if (!this.tideData?.forecast?.length)
      return 1;
    return Math.max(...this.tideData.forecast
      .map((d: any) => d.totalPredicted));
  }

  // ── INSIGHTS ─────────────────────────
  loadInsights() {
    this.insightsLoading = true;
    this.http.get<any>(`${this.BASE}/api/AIFeatures/insights`).subscribe({
      next: (d) => {
        this.insightsData = d;
        this.insightsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.insightsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getInsightTypeClass(type: string): string {
    const m: any = {
      'positive': 'ins-pos',
      'warning': 'ins-warn',
      'critical': 'ins-crit',
      'neutral': 'ins-neut',
      'info': 'ins-info'
    };
    return m[type] || 'ins-neut';
  }

  // ── DUPLICATES ───────────────────────
  loadDuplicates() {
    this.duplicatesLoading = true;
    this.http.get<any>(`${this.BASE}/api/AIFeatures/duplicates`).subscribe({
      next: (d) => {
        this.duplicatesData = d;
        this.duplicatesLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.duplicatesLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  startMerge(group: any) {
    this.mergingGroup = group;
    this.cdr.detectChanges();
  }

  confirmMerge() {
    if (!this.mergingGroup) return;

    const origTicket =
      this.mergingGroup.tickets
        .find((t: any) => t.isOriginal);
    const toClose =
      this.mergingGroup.tickets
        .filter((t: any) => !t.isOriginal)
        .map((t: any) => t.id);

    if (!origTicket || !toClose.length)
      return;

    this.mergeLoading = true;
    this.http.post(
      `${this.BASE}/api/AIFeatures/merge`,
      {
        originalTicketId: origTicket.id,
        ticketIdsToClose: toClose
      }
    ).subscribe({
      next: (res: any) => {
        this.mergeLoading = false;
        this.mergingGroup = null;
        this.mergeSuccess =
          res.message || 'Merged!';
        this.loadDuplicates();
        setTimeout(() =>
          this.mergeSuccess = '', 4000);
        this.cdr.detectChanges();
      },
      error: () => {
        this.mergeLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── TICKET SUMMARY ───────────────────
  loadRecentTickets() {
    this.http.get<any[]>(`${this.BASE}/api/Tickets`).subscribe({
      next: (d) => {
        this.recentTickets = d.slice(0, 15);
        this.cdr.detectChanges();
      }
    });
  }

  loadSummary(ticketId?: string) {
    const id =
      ticketId || this.summaryTicketId;
    if (!id) return;

    this.summaryTicketId = id;
    this.summaryLoading = true;
    this.summaryData = null;
    this.cdr.detectChanges();

    this.http.get<any>(
      `${this.BASE}/api/AIFeatures` +
      `/summary/${id}`
    ).subscribe({
      next: (d) => {
        this.summaryData = d;
        this.summaryLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.summaryLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getSentimentEmoji(s: string): string {
    if (s === 'Frustrated') return '😤';
    if (s === 'Positive') return '😊';
    return '😐';
  }

  getSentimentClass(s: string): string {
    if (s === 'Frustrated')
      return 'sent-bad';
    if (s === 'Positive')
      return 'sent-good';
    return 'sent-neutral';
  }

  getStatusClass(s: string): string {
    const m: any = {
      'Open': 'st-open',
      'InProgress': 'st-prog',
      'Pending': 'st-pend',
      'Resolved': 'st-res',
      'Closed': 'st-closed'
    };
    return m[s] || '';
  }

  getPriorityClass(p: string): string {
    const m: any = {
      'Critical': 'pr-crit',
      'High': 'pr-high',
      'Medium': 'pr-med',
      'Low': 'pr-low'
    };
    return m[p] || '';
  }

  navigateToTicket(id: string) {
    this.router.navigate(['/tickets', id]);
  }
}