import { Component, Input, OnChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard-trend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-trend.html',
  styleUrls: ['./dashboard-trend.scss']
})
export class DashboardTrendComponent implements OnChanges, AfterViewInit {
  @Input() widgetData: any = null;
  @ViewChild('trendChart') trendChartRef!: ElementRef;
  private trendChart: Chart | null = null;
  private viewReady = false;

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.widgetData) this.renderChart();
  }

  ngOnChanges() {
    if (this.viewReady && this.widgetData) this.renderChart();
  }

  renderChart() {
    if (!this.trendChartRef) return;
    if (this.trendChart) this.trendChart.destroy();

    const labels = this.widgetData.ticketsByDay
      ?.map((d: any) => d.date) || [];
    const created = this.widgetData.ticketsByDay
      ?.map((d: any) => d.count) || [];
    const resolved = this.widgetData.resolvedByDay
      ?.map((d: any) => d.count) || [];

    this.trendChart = new Chart(
      this.trendChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Created',
            data: created,
            borderColor: '#2563eb', /* High-contrast Royal Blue link color */
            backgroundColor: 'rgba(37, 99, 235, 0.04)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: 'Resolved',
            data: resolved,
            borderColor: '#10b981', /* Premium clean SaaS Emerald green accent */
            backgroundColor: 'rgba(16, 185, 129, 0.03)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { family: '-apple-system, sans-serif', size: 12 },
              color: '#475569'
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: { 
            beginAtZero: true, 
            ticks: { stepSize: 1, color: '#94a3b8', font: { size: 11 } },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }
}