import { Component, OnInit, inject, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { BusinessHoursService, BusinessHoursListItem } from '../../../core/services/business-hours.service';

@Component({
  selector: 'app-business-hours-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './business-hours-page.html',
  styleUrls: ['./business-hours-page.scss']
})
export class BusinessHoursPageComponent implements OnInit {
  private api = inject(BusinessHoursService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  items: BusinessHoursListItem[] = [];
  openMenuId: string | null = null;

  showCreate = false;
  newName = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.list().subscribe({
      next: (rows) => { this.items = rows || []; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.toastr.error('Failed to load business hours.'); this.cdr.detectChanges(); }
    });
  }

  edit(b: BusinessHoursListItem) {
    this.openMenuId = null;
    this.router.navigate(['/business-hours', b.id, 'edit']);
  }

  toggleMenu(id: string, ev: Event) {
    ev.stopPropagation();
    this.openMenuId = this.openMenuId === id ? null : id;
  }

  @HostListener('document:click') closeMenus() { this.openMenuId = null; }

  remove(b: BusinessHoursListItem) {
    this.openMenuId = null;
    if (b.isDefault) { this.toastr.warning('Default business hours cannot be deleted.'); return; }
    if (!confirm(`Delete "${b.name}"?`)) return;
    this.api.delete(b.id).subscribe({
      next: () => { this.toastr.success('Deleted.'); this.load(); },
      error: () => this.toastr.error('Delete failed.')
    });
  }

  openCreate() { this.newName = ''; this.showCreate = true; }
  cancelCreate() { this.showCreate = false; }

  submitCreate() {
    const name = this.newName.trim();
    if (!name) { this.toastr.warning('Please enter a name.'); return; }
    this.api.create({
      name, description: '', mode: 'Custom', timezone: 'UTC',
      monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
      saturday: false, sunday: false,
      startTime: '09:00', endTime: '18:00',
    }).subscribe({
      next: (created) => {
        this.showCreate = false;
        this.toastr.success('Business hours created.');
        this.router.navigate(['/business-hours', created.id, 'edit']);
      },
      error: (err) => this.toastr.error(err?.error?.message || 'Create failed.')
    });
  }
}
