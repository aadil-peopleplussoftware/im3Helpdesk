import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import {
  BusinessHoursService, BusinessHoursDetail, BusinessHoursGroup, BusinessHoursHoliday
} from '../../../core/services/business-hours.service';

type Tab = 'hours' | 'holidays' | 'groups';

interface DayRow {
  key: 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';
  label: string;
  enabled: boolean;
}

@Component({
  selector: 'app-business-hours-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent],
  templateUrl: './business-hours-edit.html',
  styleUrls: ['./business-hours-edit.scss']
})
export class BusinessHoursEditComponent implements OnInit {
  private api = inject(BusinessHoursService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  tab: Tab = 'hours';
  loading = true;
  saving = false;
  id = '';

  detail: BusinessHoursDetail | null = null;

  // Tab 1: Business hours
  editingName = false;
  nameDraft = '';
  modeChoice: 'TwentyFourSeven' | 'Custom' = 'Custom';
  timezone = 'UTC';
  startTime = '09:00';
  endTime = '18:00';
  days: DayRow[] = [
    { key: 'monday',    label: 'Monday',    enabled: true  },
    { key: 'tuesday',   label: 'Tuesday',   enabled: true  },
    { key: 'wednesday', label: 'Wednesday', enabled: true  },
    { key: 'thursday',  label: 'Thursday',  enabled: true  },
    { key: 'friday',    label: 'Friday',    enabled: true  },
    { key: 'saturday',  label: 'Saturday',  enabled: false },
    { key: 'sunday',    label: 'Sunday',    enabled: false },
  ];
  timezones = BusinessHoursService.timezones;

  // Tab 2: Holidays
  showHolidayModal = false;
  editingHoliday: BusinessHoursHoliday | null = null;
  hName = '';
  hDate = '';
  hRecurring = false;

  // Tab 3: Groups
  groupsDraft: BusinessHoursGroup[] = [];

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.id) { this.router.navigate(['/business-hours']); return; }
    this.load();
  }

  load() {
    this.loading = true;
    this.api.get(this.id).subscribe({
      next: (d) => {
        this.detail = d;
        this.nameDraft = d.name;
        this.modeChoice = (d.mode === 'TwentyFourSeven') ? 'TwentyFourSeven' : 'Custom';
        this.timezone = d.timezone || 'UTC';
        this.startTime = d.startTime || '09:00';
        this.endTime = d.endTime || '18:00';
        for (const r of this.days) r.enabled = (d as any)[r.key];
        this.groupsDraft = (d.groups || []).map(g => ({ ...g }));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load business hours.');
        this.cdr.detectChanges();
      }
    });
  }

  setTab(t: Tab) { this.tab = t; }

  startEditName() { this.editingName = true; this.nameDraft = this.detail?.name || ''; }
  cancelEditName() { this.editingName = false; this.nameDraft = this.detail?.name || ''; }
  commitEditName() { this.editingName = false; }

  // ---- Save (Hours tab) ----
  saveHours() {
    if (!this.detail) return;
    if (this.saving) return;
    if (!this.nameDraft.trim()) { this.toastr.warning('Name is required.'); return; }

    this.saving = true; this.cdr.detectChanges();

    const body = {
      name: this.nameDraft.trim(),
      description: this.detail.description || '',
      mode: this.modeChoice,
      timezone: this.timezone,
      monday:    this.days[0].enabled,
      tuesday:   this.days[1].enabled,
      wednesday: this.days[2].enabled,
      thursday:  this.days[3].enabled,
      friday:    this.days[4].enabled,
      saturday:  this.days[5].enabled,
      sunday:    this.days[6].enabled,
      startTime: this.startTime,
      endTime:   this.endTime,
    };

    this.api.update(this.id, body).subscribe({
      next: (d) => {
        this.detail = d;
        setTimeout(() => {
          this.saving = false;
          this.toastr.success('Business hours saved.');
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        setTimeout(() => {
          this.saving = false;
          this.toastr.error(err?.error?.message || err?.error?.detail || 'Save failed.');
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ---- Holidays ----
  openAddHoliday() {
    this.editingHoliday = null;
    this.hName = '';
    this.hDate = new Date().toISOString().slice(0,10);
    this.hRecurring = false;
    this.showHolidayModal = true;
  }

  openEditHoliday(h: BusinessHoursHoliday) {
    this.editingHoliday = h;
    this.hName = h.name;
    this.hDate = h.date;
    this.hRecurring = h.isRecurring;
    this.showHolidayModal = true;
  }

  cancelHoliday() { this.showHolidayModal = false; this.editingHoliday = null; }

  submitHoliday() {
    if (!this.detail) return;
    const name = this.hName.trim();
    if (!name) { this.toastr.warning('Holiday name is required.'); return; }
    if (!this.hDate) { this.toastr.warning('Pick a date.'); return; }

    const body = { name, date: this.hDate, isRecurring: this.hRecurring };

    if (this.editingHoliday) {
      this.api.updateHoliday(this.id, this.editingHoliday.id, body).subscribe({
        next: (h) => {
          const idx = this.detail!.holidays.findIndex(x => x.id === h.id);
          if (idx >= 0) this.detail!.holidays[idx] = h;
          this.showHolidayModal = false;
          this.toastr.success('Holiday updated.');
          this.cdr.detectChanges();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Update failed.')
      });
    } else {
      this.api.addHoliday(this.id, body).subscribe({
        next: (h) => {
          this.detail!.holidays = [...this.detail!.holidays, h];
          this.showHolidayModal = false;
          this.toastr.success('Holiday added.');
          this.cdr.detectChanges();
        },
        error: (err) => this.toastr.error(err?.error?.message || 'Add failed.')
      });
    }
  }

  removeHoliday(h: BusinessHoursHoliday) {
    if (!confirm(`Delete holiday "${h.name}"?`)) return;
    this.api.deleteHoliday(this.id, h.id).subscribe({
      next: () => {
        this.detail!.holidays = this.detail!.holidays.filter(x => x.id !== h.id);
        this.toastr.success('Deleted.');
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Delete failed.')
    });
  }

  // ---- Groups ----
  toggleGroup(g: BusinessHoursGroup) { g.assigned = !g.assigned; }

  saveGroups() {
    if (this.saving) return;
    this.saving = true; this.cdr.detectChanges();
    const ids = this.groupsDraft.filter(g => g.assigned).map(g => g.id);
    this.api.assignGroups(this.id, ids).subscribe({
      next: () => setTimeout(() => {
        this.saving = false;
        this.toastr.success('Groups updated.');
        this.cdr.detectChanges();
      }),
      error: (err) => setTimeout(() => {
        this.saving = false;
        this.toastr.error(err?.error?.message || 'Failed to update groups.');
        this.cdr.detectChanges();
      })
    });
  }

  back() { this.router.navigate(['/business-hours']); }

  formatHolidayDate(d: string): string {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
