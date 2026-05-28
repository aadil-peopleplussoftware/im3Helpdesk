import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { AuthService } from '../../auth/auth.service';
import {
  RecycleBinService,
  DeletedTicketRow,
  DeletedTicketDetail
} from '../../../core/services/recycle-bin.service';

@Component({
  selector: 'app-recycle-bin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent, HasPermissionDirective],
  templateUrl: './recycle-bin-page.html',
  styleUrls: ['./recycle-bin-page.scss']
})
export class RecycleBinPageComponent implements OnInit {
  private bin = inject(RecycleBinService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  isCompanyAdmin = false;

  retention: { value: number; unit: string } = { value: 30, unit: 'days' };
  rows: DeletedTicketRow[] = [];
  filteredRows: DeletedTicketRow[] = [];
  search = '';

  // Detail modal state
  openId: string | null = null;
  loadingDetail = false;
  detail: DeletedTicketDetail | null = null;
  acting = false; // disables modal buttons while restore/purge in flight

  // Permanent-delete confirmation
  confirmPurgeFor: string | null = null;

  ngOnInit() {
    this.isCompanyAdmin = this.auth.getUserRole() === 'CompanyAdmin';
    if (!this.isCompanyAdmin) {
      this.toastr.warning(
        'Only the Company Admin can view the Recycle Bin.'
      );
    }
    this.load();
  }

  load() {
    this.loading = true;
    this.bin.list(this.search?.trim() || undefined).subscribe({
      next: (res) => {
        this.retention = res.retention || { value: 30, unit: 'days' };
        this.rows = res.items || [];
        this.filteredRows = this.rows;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load recycle bin.');
        this.cdr.detectChanges();
      }
    });
  }

  onSearchChange() {
    const q = (this.search || '').trim().toLowerCase();
    if (!q) {
      this.filteredRows = this.rows;
      return;
    }
    this.filteredRows = this.rows.filter((r) =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.fromEmail || '').toLowerCase().includes(q) ||
      String(r.ticketNumber || '').includes(q)
    );
  }

  /** Open the details popup for a row. Triggers a GET so we always see fresh data. */
  openDetail(row: DeletedTicketRow) {
    this.openId = row.id;
    this.detail = null;
    this.loadingDetail = true;
    this.confirmPurgeFor = null;
    this.bin.get(row.id).subscribe({
      next: (d) => {
        this.detail = d;
        this.loadingDetail = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingDetail = false;
        this.toastr.error('Failed to load ticket details.');
        this.closeDetail();
      }
    });
  }

  closeDetail() {
    this.openId = null;
    this.detail = null;
    this.confirmPurgeFor = null;
    this.acting = false;
  }

  /** Restore: clears IsDeleted; ticket reappears in the active list. */
  restore(id: string) {
    if (this.acting) return;
    this.acting = true;
    this.bin.restore(id).subscribe({
      next: () => {
        this.toastr.success('Ticket restored');
        this.rows = this.rows.filter((r) => r.id !== id);
        this.onSearchChange();
        this.closeDetail();
        this.cdr.detectChanges();
      },
      error: () => {
        this.acting = false;
        this.toastr.error('Restore failed');
        this.cdr.detectChanges();
      }
    });
  }

  /** Two-step permanent delete: first click arms confirmation, second click commits. */
  requestPurge(id: string) {
    this.confirmPurgeFor = id;
  }

  cancelPurge() {
    this.confirmPurgeFor = null;
  }

  purge(id: string) {
    if (this.acting) return;
    this.acting = true;
    this.bin.purge(id).subscribe({
      next: () => {
        this.toastr.success('Ticket permanently deleted');
        this.rows = this.rows.filter((r) => r.id !== id);
        this.onSearchChange();
        this.closeDetail();
        this.cdr.detectChanges();
      },
      error: () => {
        this.acting = false;
        this.toastr.error('Permanent delete failed');
        this.cdr.detectChanges();
      }
    });
  }

  // ── view helpers ────────────────────────────────────
  statusLabel(s: any): string {
    if (typeof s === 'string') return s;
    const map: Record<number, string> = {
      0: 'Open',
      1: 'InProgress',
      2: 'Resolved',
      3: 'Closed',
      4: 'OnHold'
    };
    return map[s as number] ?? String(s);
  }
  priorityLabel(p: any): string {
    if (typeof p === 'string') return p;
    const map: Record<number, string> = {
      0: 'Low',
      1: 'Medium',
      2: 'High',
      3: 'Critical'
    };
    return map[p as number] ?? String(p);
  }
  priorityClass(p: any): string {
    const v = this.priorityLabel(p).toLowerCase();
    return `pill p-${v}`;
  }
  statusClass(s: any): string {
    const v = this.statusLabel(s).toLowerCase().replace(/\s+/g, '');
    return `pill s-${v}`;
  }

  trackById(_i: number, r: DeletedTicketRow) {
    return r.id;
  }
}
