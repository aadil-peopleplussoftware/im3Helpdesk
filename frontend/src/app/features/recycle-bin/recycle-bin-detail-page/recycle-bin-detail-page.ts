import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { AuthService } from '../../auth/auth.service';
import { DeletedTicketDetail, RecycleBinService } from '../../../core/services/recycle-bin.service';

@Component({
  selector: 'app-recycle-bin-detail-page',
  standalone: true,
  imports: [CommonModule, RouterModule, LayoutComponent, HasPermissionDirective],
  templateUrl: './recycle-bin-detail-page.html',
  styleUrls: ['./recycle-bin-detail-page.scss']
})
export class RecycleBinDetailPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);
  private bin = inject(RecycleBinService);
  private destroy$ = new Subject<void>();

  loading = true;
  loadingFresh = false;
  acting = false;
  isCompanyAdmin = false;
  confirmPurge = false;
  detail: DeletedTicketDetail | null = null;

  ngOnInit(): void {
    this.isCompanyAdmin = this.auth.getUserRole() === 'CompanyAdmin';

    const seed = (history.state?.seed || null) as any;
    if (seed?.id) {
      this.detail = this.seedToDetail(seed);
      this.loading = false;
    }

    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const id = params.get('id') || '';
        if (!id) {
          this.router.navigate(['/recycle-bin']);
          return;
        }
        this.load(id);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(id: string): void {
    this.loading = !this.detail;
    this.loadingFresh = !!this.detail;
    this.confirmPurge = false;
    this.bin.get(id).subscribe({
      next: (res) => {
        this.detail = res;
        this.loading = false;
        this.loadingFresh = false;
      },
      error: () => {
        this.loading = false;
        this.loadingFresh = false;
        if (!this.detail) {
          this.toastr.error('Failed to load recycle-bin ticket details.');
          this.router.navigate(['/recycle-bin']);
        }
      }
    });
  }

  private seedToDetail(seed: any): DeletedTicketDetail {
    return {
      id: seed.id,
      ticketNumber: seed.ticketNumber,
      title: seed.title,
      category: seed.category,
      status: seed.status,
      priority: seed.priority,
      fromEmail: seed.fromEmail ?? null,
      fromName: seed.fromName ?? null,
      createdAt: seed.createdAt,
      deletedAt: seed.deletedAt,
      deletedByUserId: seed.deletedByUserId ?? null,
      deletedByName: seed.deletedByName ?? null,
      assignedToName: seed.assignedToName ?? null,
      purgeAfter: seed.purgeAfter ?? null,
      description: '',
      tags: '',
      updatedAt: null,
      resolvedAt: null,
      slaDeadline: null,
      isSlaBreached: false,
      slaStatus: null,
      timeSpentMinutes: 0,
      ticketType: '',
      createdByName: null
    };
  }

  backToList(): void {
    this.router.navigate(['/recycle-bin']);
  }

  restore(): void {
    if (!this.detail || this.acting) return;
    this.acting = true;

    this.bin.restore(this.detail.id).subscribe({
      next: () => {
        this.toastr.success('Ticket restored successfully.');
        this.router.navigate(['/recycle-bin']);
      },
      error: () => {
        this.acting = false;
        this.toastr.error('Restore failed.');
      }
    });
  }

  requestPurge(): void {
    this.confirmPurge = true;
  }

  cancelPurge(): void {
    this.confirmPurge = false;
  }

  purge(): void {
    if (!this.detail || this.acting) return;
    this.acting = true;

    this.bin.purge(this.detail.id).subscribe({
      next: () => {
        this.toastr.success('Ticket permanently deleted.');
        this.router.navigate(['/recycle-bin']);
      },
      error: () => {
        this.acting = false;
        this.toastr.error('Permanent delete failed.');
      }
    });
  }

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

  statusClass(s: any): string {
    const v = this.statusLabel(s).toLowerCase().replace(/\s+/g, '');
    return `pill s-${v}`;
  }

  priorityClass(p: any): string {
    const v = this.priorityLabel(p).toLowerCase();
    return `pill p-${v}`;
  }
}
