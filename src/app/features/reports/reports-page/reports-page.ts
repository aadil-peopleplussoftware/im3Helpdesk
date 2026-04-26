import {
  Component,Input, OnInit, AfterViewInit,
  ChangeDetectorRef, inject,
  ViewChild, ElementRef
} from '@angular/core';
import Chart from 'chart.js/auto';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { LayoutComponent } from '../../../shared/layout/layout';


@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent],
  templateUrl: './reports-page.html',
  styleUrls: ['./reports-page.scss']
})
export class ReportsComponent
  implements OnInit, AfterViewInit {

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  @Input() embedded: boolean = false;
  @ViewChild('statusChart')
    statusChartRef!: ElementRef;
  @ViewChild('trendChart')
    trendChartRef!: ElementRef;
  @ViewChild('priorityChart')
    priorityChartRef!: ElementRef;
  @ViewChild('categoryChart')
    categoryChartRef!: ElementRef;


  stats: any = null;
  dashStats: any = null;
  loading = true;
  dateRange = '30';
  charts: Chart[] = [];

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    this.loadStats();
    this.loadDashStats();
  }

  ngAfterViewInit() {}

  loadStats() {
    this.loading = true;
    this.http.get<any>(
      `https://localhost:7071/api/Dashboard/widgets`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => this.renderCharts(), 200);
      },
      error: () => { this.loading = false; }
    });
  }

  loadDashStats() {
    this.http.get<any>(
      `https://localhost:7071/api/Dashboard/stats`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.dashStats = data;
        this.cdr.detectChanges();
      }
    });
  }

  renderCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    const compact = {
      responsive: true,
      maintainAspectRatio: false
    };

    if (this.statusChartRef && this.stats?.byStatus?.length) {
      const ctx = this.statusChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: this.stats.byStatus.map((s: any) => s.status),
          datasets: [{
            data: this.stats.byStatus.map((s: any) => s.count),
            backgroundColor: ['#22c55e','#f59e0b','#3b82f6','#8b5cf6','#9ca3af'],
            borderWidth: 1
          }]
        },
        options: { ...compact, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 8, boxWidth: 10 } } } }
      }));
    }

    if (this.priorityChartRef && this.stats?.byPriority?.length) {
      const ctx = this.priorityChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: this.stats.byPriority.map((p: any) => p.priority),
          datasets: [{ data: this.stats.byPriority.map((p: any) => p.count), backgroundColor: ['#22c55e','#3b82f6','#f59e0b','#ef4444'], borderRadius: 6, borderWidth: 0 }]
        },
        options: { ...compact, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }

    if (this.trendChartRef && this.stats?.trend?.length) {
      const ctx = this.trendChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.stats.trend.map((t: any) => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [{ label: 'Tickets', data: this.stats.trend.map((t: any) => t.count), borderColor: '#2563eb', backgroundColor: '#2563eb18', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 }]
        },
        options: { ...compact, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }

    if (this.categoryChartRef && this.stats?.byCategory?.length) {
      const ctx = this.categoryChartRef.nativeElement.getContext('2d');
      this.charts.push(new Chart(ctx, {
        type: 'bar',
        data: {
          labels: this.stats.byCategory.map((c: any) => c.category || 'Other'),
          datasets: [{ data: this.stats.byCategory.map((c: any) => c.count), backgroundColor: '#3b82f680', borderColor: '#3b82f6', borderRadius: 6, borderWidth: 1 }]
        },
        options: { ...compact, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }
  }

  exportCsv() {
    const csv = 'Status,Count\n' +
      (this.stats?.byStatus || [])
        .map((s: any) => `${s.status},${s.count}`)
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${Date.now()}.csv`;
    a.click();
  }

  exportPdf() { window.print(); }
}