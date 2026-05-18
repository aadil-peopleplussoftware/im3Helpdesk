import { Component, Input, OnChanges, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard-charts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-charts.html',
  styleUrls: ['./dashboard-charts.scss']
})
export class DashboardChartsComponent implements OnChanges, AfterViewInit {
  @Input() stats: any = null;
  @ViewChild('statusChart') statusChartRef!: ElementRef;
  @ViewChild('priorityChart') priorityChartRef!: ElementRef;

  private statusChart: Chart | null = null;
  private priorityChart: Chart | null = null;
  private viewReady = false;

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.stats) this.renderCharts();
  }

  ngOnChanges() {
    if (this.viewReady && this.stats) this.renderCharts();
  }

  renderCharts() {
    this.renderStatusChart();
    this.renderPriorityChart();
  }

  renderStatusChart() {
    if (!this.statusChartRef) return;
    if (this.statusChart) this.statusChart.destroy();

    this.statusChart = new Chart(
      this.statusChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Open', 'In Progress', 'Resolved', 'Closed'],
        datasets: [{
          data: [
            this.stats.openTickets || 0,
            this.stats.inProgressTickets || 0,
            this.stats.resolvedTickets || 0,
            this.stats.closedTickets || 0
          ],
          backgroundColor: [
            '#ef5350', '#ffa726',
            '#66bb6a', '#bdbdbd'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        },
        cutout: '65%'
      }
    });
  }

  renderPriorityChart() {
    if (!this.priorityChartRef) return;
    if (this.priorityChart) this.priorityChart.destroy();

    this.priorityChart = new Chart(
      this.priorityChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        datasets: [{
          label: 'Tickets',
          data: [
            this.stats.lowPriority || 0,
            this.stats.mediumPriority || 0,
            this.stats.highPriority || 0,
            this.stats.criticalPriority || 0
          ],
          backgroundColor: [
            '#66bb6a', '#42a5f5',
            '#ffa726', '#ef5350'
          ],
          borderRadius: 8,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }
}