import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { AuthService } from '../../auth/auth.service';
import {
  RecycleBinService,
  DeletedTicketRow
} from '../../../core/services/recycle-bin.service';

@Component({
  selector: 'app-recycle-bin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './recycle-bin-page.html',
  styleUrls: ['./recycle-bin-page.scss']
})
export class RecycleBinPageComponent implements OnInit {
  private bin = inject(RecycleBinService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  loading = true;
  isCompanyAdmin = false;

  retention: { value: number; unit: string } = { value: 30, unit: 'days' };
  rows: DeletedTicketRow[] = [];
  filteredRows: DeletedTicketRow[] = [];
  search = '';

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

  openDetail(row: DeletedTicketRow) {
    this.router.navigate(['/recycle-bin', row.id], {
      state: { seed: row }
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
