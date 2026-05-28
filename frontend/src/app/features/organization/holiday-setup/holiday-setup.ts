import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import {
  HolidayService,
  HolidayRow,
  YearDetail,
  YearSetupSummary
} from '../../../core/services/holiday.service';

interface DraftHoliday {
  // Local-only id used to track unsaved rows in the table.
  draftId?: string;
  id?: string;
  date: string;       // yyyy-MM-dd
  occasion: string;
  day?: string | null;
  isFloating: boolean;
  editing?: boolean;
  saving?: boolean;
}

/**
 * Admin-only Holiday Setup screen.
 *
 * Two-pane UI (mirrors the rest of the workspace):
 *   • Left: list of years that the admin has set up (newest first).
 *   • Right: detail of the selected year — PDF reference, floating-holiday
 *     allowance + policy text, and an editable table of holiday rows.
 *
 * The PDF is stored only as a reference attachment; holidays are managed
 * via the table because we do not currently have a server-side PDF parser.
 */
@Component({
  selector: 'app-holiday-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent, HasPermissionDirective],
  templateUrl: './holiday-setup.html',
  styleUrls: ['./holiday-setup.scss']
})
export class HolidaySetupComponent implements OnInit {
  private holidayService = inject(HolidayService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  public router = inject(Router);

  loading = true;
  saving = false;
  uploadingPdf = false;

  years: YearSetupSummary[] = [];
  selectedYear: number | null = null;
  detail: YearDetail | null = null;

  // Form state (year-level setup)
  editFloatingAllowance = 0;
  editPolicyText = '';

  // New year + new holiday row dialogs (inline)
  showNewYearPanel = false;
  newYearValue: number = new Date().getFullYear();

  // Editable list of holidays for the currently selected year
  rows: DraftHoliday[] = [];
  newRow: DraftHoliday = this.emptyRow();

  baseUrl = environment.apiUrl.replace('/api', '');

  ngOnInit() {
    this.loadYears(true);
  }

  // ─────────────────────────────────────────────────
  // Loaders
  // ─────────────────────────────────────────────────
  loadYears(autoSelectFirst = false) {
    this.loading = true;
    this.holidayService.listYears().subscribe({
      next: (res) => {
        this.years = res || [];
        this.loading = false;

        if (autoSelectFirst && this.years.length > 0) {
          this.selectYear(this.years[0].year);
        } else if (this.selectedYear && this.years.some(y => y.year === this.selectedYear)) {
          this.selectYear(this.selectedYear);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load holiday years');
        this.cdr.detectChanges();
      }
    });
  }

  selectYear(year: number) {
    this.selectedYear = year;
    this.holidayService.getYear(year).subscribe({
      next: (d) => {
        this.detail = d;
        this.editFloatingAllowance = d.setup.floatingHolidayAllowance || 0;
        this.editPolicyText = d.setup.policyText || '';
        this.rows = (d.holidays || []).map(h => ({
          id: h.id,
          date: h.date,
          occasion: h.occasion,
          day: h.day,
          isFloating: h.isFloating,
          editing: false
        }));
        this.newRow = this.emptyRow(year);
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to load holidays')
    });
  }

  // ─────────────────────────────────────────────────
  // New-year flow
  // ─────────────────────────────────────────────────
  toggleNewYearPanel() {
    this.showNewYearPanel = !this.showNewYearPanel;
    if (this.showNewYearPanel) {
      // Pick "next year not already in list" as the default.
      const existing = new Set(this.years.map(y => y.year));
      let candidate = new Date().getFullYear();
      while (existing.has(candidate)) candidate++;
      this.newYearValue = candidate;
    }
  }

  createYear() {
    const y = Math.trunc(this.newYearValue);
    if (!y || y < 2000 || y > 2100) {
      this.toastr.warning('Enter a valid year');
      return;
    }
    if (this.years.some(x => x.year === y)) {
      this.toastr.info('That year already exists');
      this.showNewYearPanel = false;
      this.selectYear(y);
      return;
    }
    this.holidayService.saveYearSetup(y, {
      year: y,
      floatingHolidayAllowance: 0,
      policyText: ''
    }).subscribe({
      next: () => {
        this.toastr.success(`Holiday list ${y} created`);
        this.showNewYearPanel = false;
        this.selectedYear = y;
        this.loadYears(false);
      },
      error: () => this.toastr.error('Could not create year')
    });
  }

  deleteYear() {
    if (!this.selectedYear) return;
    if (!confirm(`Delete the holiday list for ${this.selectedYear}? This also removes every holiday row for that year.`)) return;

    this.holidayService.deleteYear(this.selectedYear).subscribe({
      next: () => {
        this.toastr.success('Year deleted');
        this.detail = null;
        this.selectedYear = null;
        this.loadYears(true);
      },
      error: () => this.toastr.error('Delete failed')
    });
  }

  // ─────────────────────────────────────────────────
  // Year-level (allowance + policy + PDF)
  // ─────────────────────────────────────────────────
  saveYearLevel() {
    if (!this.selectedYear) return;
    this.saving = true;
    this.holidayService.saveYearSetup(this.selectedYear, {
      year: this.selectedYear,
      floatingHolidayAllowance: this.editFloatingAllowance || 0,
      policyText: this.editPolicyText || ''
    }).subscribe({
      next: () => {
        this.saving = false;
        this.toastr.success('Saved');
        this.selectYear(this.selectedYear!);
        this.loadYears(false);
      },
      error: () => {
        this.saving = false;
        this.toastr.error('Save failed');
      }
    });
  }

  onPdfPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedYear) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.toastr.warning('Only PDF files are allowed');
      return;
    }

    // If the year already has rows, ask whether to replace them.
    const hasRows = (this.rows?.length ?? 0) > 0;
    const replace = hasRows
      ? confirm('This year already has holidays. Replace all existing rows with the ones extracted from this PDF?\n\nClick OK to REPLACE, Cancel to keep existing rows and only append new ones.')
      : false;

    this.uploadingPdf = true;
    this.holidayService.uploadPdf(this.selectedYear, file, replace).subscribe({
      next: (res: any) => {
        // Defer all state mutations + toast + reload to the next macrotask
        // so we don't trip Angular's NG0100 (ExpressionChangedAfterChecked).
        setTimeout(() => {
          this.uploadingPdf = false;
          const added = res?.added ?? 0;
          const extracted = res?.extracted ?? 0;
          const skipped = res?.skipped ?? 0;
          const warnings: string[] = res?.warnings ?? [];

          if (added > 0) {
            this.toastr.success(
              `PDF uploaded. Imported ${added} holiday(s)` +
              (skipped > 0 ? ` (skipped ${skipped} duplicate(s))` : '')
            );
          } else if (extracted > 0 && skipped > 0) {
            this.toastr.info(`PDF uploaded. All ${skipped} detected holidays already exist.`);
          } else {
            this.toastr.warning(
              warnings[0] ||
              'PDF uploaded, but no holidays could be detected. Please add them manually.'
            );
          }
          input.value = '';
          this.selectYear(this.selectedYear!);
          this.loadYears(false);
        }, 0);
      },
      error: () => {
        setTimeout(() => {
          this.uploadingPdf = false;
          this.toastr.error('Upload failed');
          input.value = '';
        }, 0);
      }
    });
  }

  pdfHref(url?: string | null): string {
    if (!url) return '';
    return url.startsWith('http') ? url : `${this.baseUrl}${url}`;
  }

  // ─────────────────────────────────────────────────
  // Holiday row CRUD
  // ─────────────────────────────────────────────────
  private emptyRow(year?: number): DraftHoliday {
    const y = year ?? this.selectedYear ?? new Date().getFullYear();
    return {
      date: `${y}-01-01`,
      occasion: '',
      day: '',
      isFloating: false,
      editing: true
    };
  }

  addRow() {
    if (!this.selectedYear) return;
    const r = this.newRow;
    if (!r.date || !r.occasion?.trim()) {
      this.toastr.warning('Date and Occasion are required');
      return;
    }
    const year = new Date(r.date).getFullYear() || this.selectedYear;

    this.holidayService.create({
      year,
      date: r.date,
      occasion: r.occasion.trim(),
      day: this.computeDayLabel(r.date, r.isFloating, r.day),
      isFloating: !!r.isFloating
    }).subscribe({
      next: (created) => {
        this.rows = [...this.rows, {
          id: created.id, date: created.date, occasion: created.occasion,
          day: created.day, isFloating: created.isFloating
        }].sort((a, b) => a.date.localeCompare(b.date));
        this.newRow = this.emptyRow(this.selectedYear!);
        this.loadYears(false);
        this.toastr.success('Holiday added');
        this.cdr.detectChanges();
      },
      error: (e) => this.toastr.error(e?.error?.message || 'Add failed')
    });
  }

  editRow(row: DraftHoliday) { row.editing = true; }

  cancelEdit(row: DraftHoliday) {
    row.editing = false;
    // Re-fetch to restore original values (keeps UX simple)
    if (this.selectedYear) this.selectYear(this.selectedYear);
  }

  saveRow(row: DraftHoliday) {
    if (!row.id || !this.selectedYear) return;
    if (!row.date || !row.occasion?.trim()) {
      this.toastr.warning('Date and Occasion are required');
      return;
    }
    row.saving = true;
    const year = new Date(row.date).getFullYear() || this.selectedYear;

    this.holidayService.update(row.id, {
      year,
      date: row.date,
      occasion: row.occasion.trim(),
      day: this.computeDayLabel(row.date, row.isFloating, row.day),
      isFloating: !!row.isFloating
    }).subscribe({
      next: (u) => {
        row.saving = false;
        row.editing = false;
        row.date = u.date;
        row.occasion = u.occasion;
        row.day = u.day;
        row.isFloating = u.isFloating;
        this.toastr.success('Updated');
        this.loadYears(false);
        this.cdr.detectChanges();
      },
      error: () => {
        row.saving = false;
        this.toastr.error('Update failed');
      }
    });
  }

  deleteRow(row: DraftHoliday) {
    if (!row.id) return;
    if (!confirm(`Delete "${row.occasion}"?`)) return;
    this.holidayService.delete(row.id).subscribe({
      next: () => {
        this.rows = this.rows.filter(r => r.id !== row.id);
        this.loadYears(false);
        this.toastr.success('Deleted');
      },
      error: () => this.toastr.error('Delete failed')
    });
  }

  // ─────────────────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────────────────
  /**
   * Auto-fills the day-of-week column when the admin leaves it blank.
   * Matches the screenshot style: "MONDAY" or "FRIDAY (Floating)".
   */
  computeDayLabel(date: string, isFloating: boolean, manual?: string | null): string {
    const manualTrim = (manual || '').trim();
    if (manualTrim) return manualTrim;
    if (!date) return '';
    const d = new Date(date + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    const names = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const base = names[d.getUTCDay()];
    return isFloating ? `${base} (Floating)` : base;
  }

  dayPreview(row: DraftHoliday): string {
    return this.computeDayLabel(row.date, !!row.isFloating, row.day);
  }
}
