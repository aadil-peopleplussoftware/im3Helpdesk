import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type HourlyPoint = {
  dayOfWeek: number; // Monday=1..Sunday=7
  hour: number; // 0..23
  count: number;
};

@Component({
  selector: 'app-heatmap-hourly',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './heatmap-hourly.html',
  styleUrls: ['./heatmap-hourly.scss']
})
export class HeatmapHourlyComponent {
  @Input() data: HourlyPoint[] = [];
  @Input() startDate = '';
  @Input() endDate = '';

  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly days = [
    { n: 1, name: 'Monday' },
    { n: 2, name: 'Tuesday' },
    { n: 3, name: 'Wednesday' },
    { n: 4, name: 'Thursday' },
    { n: 5, name: 'Friday' },
    { n: 6, name: 'Saturday' },
    { n: 7, name: 'Sunday' }
  ];

  getCount(dayOfWeek: number, hour: number) {
    const found = this.data.find(d => d.dayOfWeek === dayOfWeek && d.hour === hour);
    return found?.count ?? 0;
  }

  getMaxCount() {
    return this.data.reduce((m, x) => Math.max(m, x.count ?? 0), 0);
  }

  getBusiestSlot() {
    let best: { dayOfWeek: number; hour: number; count: number } | null = null;
    for (const p of this.data) {
      if (!best || (p.count ?? 0) > best.count) {
        best = { dayOfWeek: p.dayOfWeek, hour: p.hour, count: p.count ?? 0 };
      }
    }
    return best;
  }

  getAvgSlot() {
    const total = this.data.reduce((acc, x) => acc + (x.count ?? 0), 0);
    return total / 168;
  }

  getCellColor(count: number, maxCount: number): string {
    if (count === 0) return 'var(--ui-color-bg-subtle)';

    // normalize to maxCount, but keep threshold buckets from spec
    const intensity = maxCount === 0 ? 0 : (count / maxCount);
    if (intensity < 0.25) return 'rgba(var(--ui-color-primary-rgb), 0.25)';
    if (intensity < 0.50) return 'rgba(var(--ui-color-primary-rgb), 0.50)';
    if (intensity < 0.75) return 'rgba(var(--ui-color-primary-rgb), 0.75)';
    return 'var(--ui-color-primary)';
  }

  hourLabel(hour: number) {
    const dt = new Date(2000, 0, 1, hour, 0, 0);
    return dt.toLocaleString('en-US', { hour: 'numeric', hour12: true }).replace(':00', '');
  }

  tooltip(dayName: string, hour: number, count: number) {
    const busiest = this.getBusiestSlot();
    const isBusiest = busiest && busiest.dayOfWeek === this.dayNumber(dayName) && busiest.hour === hour;
    const avg = this.getAvgSlot();
    const vs = count > avg ? 'Above average' : count < avg ? 'Below average' : 'Average';

    const title = `${dayName} ${this.hourLabel(hour)} — ${count} ${count === 1 ? 'ticket' : 'tickets'}`;
    const line2 = isBusiest ? 'Busiest slot this period' : vs;
    return `${title}\n${line2}`;
  }

  private dayNumber(name: string) {
    const map: Record<string, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7
    };
    return map[name] ?? 1;
  }
}
