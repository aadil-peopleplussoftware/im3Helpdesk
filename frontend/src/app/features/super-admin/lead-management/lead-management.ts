import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { SuperAdminService } from '../../../core/services/super-admin';
import { LayoutComponent } from '../../../layouts/main-layout/layout';

@Component({
  selector: 'app-lead-management',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent],
  templateUrl: './lead-management.html',
  styleUrls: ['./lead-management.scss']
})
export class LeadManagementComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  loading = true;
  approvingId = '';
  rejectingId = '';

  private allLeads: any[] = [];
  filteredLeads: any[] = [];
  searchQuery = '';

  statusFilter: 'pending' | 'approved' | 'rejected' | 'completed' | 'all' = 'pending';
  summary = {
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
    total: 0
  };

  readonly LeadStatus = {
    Pending: 0,
    Approved: 1,
    Rejected: 2,
    Completed: 3
  } as const;

  lastGeneratedSetupUrl = '';
  lastGeneratedFor = '';

  ngOnInit(): void {
    this.loadLeads();
  }

  private computeSummary(): void {
    const next = {
      pending: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      total: 0
    };

    for (const l of this.allLeads || []) {
      switch (l?.status) {
        case this.LeadStatus.Pending:
          next.pending++;
          break;
        case this.LeadStatus.Approved:
          next.approved++;
          break;
        case this.LeadStatus.Rejected:
          next.rejected++;
          break;
        case this.LeadStatus.Completed:
          next.completed++;
          break;
        default:
          break;
      }
    }

    next.total = next.pending + next.approved + next.rejected + next.completed;
    this.summary = next;
  }

  loadLeads(): void {
    this.loading = true;
    // Fetch all leads once, then filter client-side. This keeps summary chips accurate
    // and avoids depending on a separate /summary endpoint.
    this.superAdminService.getLeads(undefined).subscribe({
      next: (data) => {
        this.allLeads = data || [];
        this.computeSummary();
        this.applyFilter();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load leads.');
        this.cdr.detectChanges();
      }
    });
  }

  setStatusFilter(next: 'pending' | 'approved' | 'rejected' | 'completed' | 'all'): void {
    if (this.statusFilter === next) return;
    this.statusFilter = next;
    this.searchQuery = '';
    this.applyFilter();
  }

  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    let result = [...this.allLeads];

    if (this.statusFilter !== 'all') {
      const statusToNumber: Record<string, number> = {
        pending: this.LeadStatus.Pending,
        approved: this.LeadStatus.Approved,
        rejected: this.LeadStatus.Rejected,
        completed: this.LeadStatus.Completed
      };
      const wanted = statusToNumber[this.statusFilter];
      result = result.filter(l => l?.status === wanted);
    }

    if (q) {
      result = result.filter(l =>
        l.organizationName?.toLowerCase().includes(q) ||
        l.ownerName?.toLowerCase().includes(q) ||
        l.workEmail?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.notes?.toLowerCase().includes(q)
      );
    }

    this.filteredLeads = result;
    this.cdr.detectChanges();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.applyFilter();
  }

  approve(lead: any): void {
    if (lead?.status !== this.LeadStatus.Pending) return;
    this.approvingId = lead.id;
    this.cdr.detectChanges();

    this.superAdminService.approveLead(lead.id).subscribe({
      next: (res) => {
        this.lastGeneratedSetupUrl = res?.setupUrl || '';
        this.lastGeneratedFor = lead.organizationName || lead.workEmail || 'Lead';

        if (this.lastGeneratedSetupUrl) {
          navigator.clipboard?.writeText(this.lastGeneratedSetupUrl).catch(() => undefined);
        }

        const emailSent = !!res?.emailSent;
        const emailError = (res?.emailError || '').toString().trim();
        if (emailSent) {
          this.toastr.success('Lead approved. Setup link sent to email.');
        } else {
          this.toastr.warning(
            emailError
              ? `Lead approved, but email failed: ${emailError}`
              : 'Lead approved. Email could not be sent (check SMTP settings).'
          );
        }

        // Update local state (show status in the table)
        const target = this.allLeads.find(x => x.id === lead.id);
        if (target) {
          target.status = this.LeadStatus.Approved;
          target.approvedAt = new Date().toISOString();
          target.updatedAt = target.approvedAt;
        }

        // Refresh summary badges (pending/approved/etc)
        this.computeSummary();
        this.applyFilter();

        // Redirect only when email was sent; if it failed, keep the banner visible
        // so Super Admin can copy/open the setup link.
        if (emailSent) {
          this.router.navigate(['/admin/organizations']).catch(() => undefined);
        }
      },
      error: (err) => {
        this.approvingId = '';
        this.cdr.detectChanges();
        this.toastr.error(err.error?.message || 'Approval failed.');
      },
      complete: () => {
        this.approvingId = '';
        this.cdr.detectChanges();
      }
    });
  }

  reject(lead: any): void {
    if (lead?.status !== this.LeadStatus.Pending) return;
    const ok = confirm(`Reject lead for ${lead.organizationName || lead.workEmail || 'this request'}?`);
    if (!ok) return;

    this.rejectingId = lead.id;
    this.cdr.detectChanges();

    this.superAdminService.rejectLead(lead.id).subscribe({
      next: () => {
        this.toastr.success('Lead rejected.');
        const target = this.allLeads.find(x => x.id === lead.id);
        if (target) {
          target.status = this.LeadStatus.Rejected;
          target.rejectedAt = new Date().toISOString();
          target.updatedAt = target.rejectedAt;
        }
        this.computeSummary();
        this.applyFilter();
      },
      error: (err) => {
        this.toastr.error(err.error?.message || 'Reject failed.');
      },
      complete: () => {
        this.rejectingId = '';
        this.cdr.detectChanges();
      }
    });
  }

  copyLastLink(): void {
    if (!this.lastGeneratedSetupUrl) return;
    navigator.clipboard?.writeText(this.lastGeneratedSetupUrl).then(
      () => this.toastr.success('Setup link copied.'),
      () => this.toastr.error('Copy failed.')
    );
  }

  getStatusLabel(status: number): string {
    switch (status) {
      case this.LeadStatus.Pending:
        return 'Pending';
      case this.LeadStatus.Approved:
        return 'Approved';
      case this.LeadStatus.Rejected:
        return 'Rejected';
      case this.LeadStatus.Completed:
        return 'Completed';
      default:
        return 'Unknown';
    }
  }

  getStatusClass(status: number): string {
    switch (status) {
      case this.LeadStatus.Pending:
        return 'pending';
      case this.LeadStatus.Approved:
        return 'approved';
      case this.LeadStatus.Rejected:
        return 'rejected';
      case this.LeadStatus.Completed:
        return 'completed';
      default:
        return 'unknown';
    }
  }

  countByStatus(status: number): number {
    return (this.allLeads || []).filter(x => x?.status === status).length;
  }
}