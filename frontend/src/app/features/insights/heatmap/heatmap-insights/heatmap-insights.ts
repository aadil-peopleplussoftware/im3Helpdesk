import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  selector: 'app-heatmap-insights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './heatmap-insights.html',
  styleUrls: ['./heatmap-insights.scss']
})
export class HeatmapInsightsComponent {
  @Input() insights!: InsightsModel;
}
