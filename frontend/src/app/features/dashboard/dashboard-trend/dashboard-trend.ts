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
            borderColor: '#1976d2',
            backgroundColor: 'rgba(25,118,210,0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 4
          },
          {
            label: 'Resolved',
            data: resolved,
            borderColor: '#4caf50',
            backgroundColor: 'rgba(76,175,80,0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }
}