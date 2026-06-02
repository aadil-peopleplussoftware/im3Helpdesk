import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { AuthService } from '../../auth/auth.service';
import {
  SlaPoliciesService,
  SlaPolicyListItem
} from '../../../core/services/sla-policies.service';

@Component({
  selector: 'app-sla-policies-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './sla-policies-page.html',
  styleUrls: ['./sla-policies-page.scss']
})
export class SlaPoliciesPageComponent implements OnInit {
  private api = inject(SlaPoliciesService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  loading = true;
  isCompanyAdmin = false;
  rows: SlaPolicyListItem[] = [];
  /** Which row's kebab menu is open. */
  openMenuFor: string | null = null;

  ngOnInit() {
    this.isCompanyAdmin = this.auth.getUserRole() === 'CompanyAdmin';
    this.load();
  }

  load() {
    this.loading = true;
    this.api.list().subscribe({
      next: (rows) => {
        this.rows = rows || [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load SLA policies.');
        this.cdr.detectChanges();
      }
    });
  }

  edit(row: SlaPolicyListItem) {
    this.router.navigate(['/sla-policies', row.id, 'edit']);
  }

  toggle(row: SlaPolicyListItem, ev: Event) {
    ev.stopPropagation();
    const next = !row.isActive;
    this.api.toggle(row.id, next).subscribe({
      next: () => {
        row.isActive = next;
        this.toastr.success(`Policy ${next ? 'enabled' : 'disabled'}.`);
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to update policy.')
    });
  }

  toggleMenu(id: string, ev: Event) {
    ev.stopPropagation();
    this.openMenuFor = this.openMenuFor === id ? null : id;
  }

  closeMenus() {
    this.openMenuFor = null;
  }

  remove(row: SlaPolicyListItem, ev: Event) {
    ev.stopPropagation();
    this.openMenuFor = null;
    if (row.isDefault) {
      this.toastr.warning('Default SLA policy cannot be deleted.');
      return;
    }
    if (!confirm(`Delete SLA policy "${row.name}"?`)) return;
    this.api.delete(row.id).subscribe({
      next: () => {
        this.rows = this.rows.filter(r => r.id !== row.id);
        this.toastr.success('Policy deleted.');
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to delete policy.')
    });
  }

  newPolicy() {
    // For now, a "new policy" first creates a stub server-side then opens edit.
    this.api.create({
      name: 'New SLA policy',
      description: '',
      isActive: true,
      targets: [
        { priority: 3, firstResponseMinutes: 30,   resolutionMinutes: 240,  operationalHours: 'BusinessHours', escalationEnabled: true },
        { priority: 2, firstResponseMinutes: 60,   resolutionMinutes: 720,  operationalHours: 'BusinessHours', escalationEnabled: true },
        { priority: 1, firstResponseMinutes: 480,  resolutionMinutes: 1440, operationalHours: 'BusinessHours', escalationEnabled: true },
        { priority: 0, firstResponseMinutes: 1440, resolutionMinutes: 4320, operationalHours: 'BusinessHours', escalationEnabled: true },
      ],
      reminders: [],
      escalations: [],
    }).subscribe({
      next: (p) => this.router.navigate(['/sla-policies', p.id, 'edit']),
      error: () => this.toastr.error('Failed to create policy.')
    });
  }
}
