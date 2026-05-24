import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

type DailyPoint = {
  date: string;
  count: number;
  dayName: string;
};

type HourlyPoint = {
  dayOfWeek: number;
  hour: number;
  count: number;
};

@Component({
  selector: 'app-heatmap-daily',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './heatmap-daily.html',
  styleUrls: ['./heatmap-daily.scss']
})
export class HeatmapDailyComponent {
  @Input() data: DailyPoint[] = [];
  @Input() hourly: HourlyPoint[] = [];

  busiest: DailyPoint | null = null;
  quietest: DailyPoint | null = null;

  ngOnChanges() {
    this.busiest = this.computeBusiest();
    this.quietest = this.computeQuietest();
  }

  getMax() {
    return this.data.reduce((m, x) => Math.max(m, x.count ?? 0), 0);
  }

  getBarWidth(count: number, max: number) {
    if (max === 0) return '0%';
    const pct = Math.max(0, Math.min(100, (count / max) * 100));
    return `${pct}%`;
  }

  getBarColor(count: number): string {
    if (count <= 0) return 'var(--ui-color-bg-subtle)';
    if (count <= 3) return 'var(--ui-color-success)';
    if (count <= 7) return 'var(--ui-color-warning-soft)';
    if (count <= 12) return 'var(--ui-color-warning)';
    return 'var(--ui-color-danger)';
  }

  private computeBusiest(): DailyPoint | null {
    if (!this.data?.length) return null;
    return [...this.data]
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0] || null;
  }

  private computeQuietest(): DailyPoint | null {
    if (!this.data?.length) return null;
    const nonEmpty = this.data.filter(d => (d.count ?? 0) > 0);
    return [...(nonEmpty.length ? nonEmpty : this.data)]
      .sort((a, b) => (a.count ?? 0) - (b.count ?? 0))[0] || null;
  }

  getPeakHourRange(): string {
    const byHour = new Map<number, number>();
    for (const p of this.hourly) {
      byHour.set(p.hour, (byHour.get(p.hour) ?? 0) + (p.count ?? 0));
    }
    const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
    const hour = peak?.[0] ?? 10;
    return this.formatHourRange(hour);
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
}
