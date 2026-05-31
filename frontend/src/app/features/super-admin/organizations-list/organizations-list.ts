import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { SuperAdminService } from '../../../core/services/super-admin';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { ActiveFilterPipe } from '../../../shared/pipes/active-filter-pipe';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-organizations-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    FormsModule, LayoutComponent,
    ActiveFilterPipe
  ],
  templateUrl: './organizations-list.html',
  styleUrls: ['./organizations-list.scss']
})
export class OrganizationsListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  organizations: any[] = [];
  filteredOrganizations: any[] = [];
  loading = true;
  searchQuery = '';
  filterStatus = '';
  detailsLoading = false;
  selectedOrg: any = null;
  readonly baseUrl = environment.baseUrl;

  ngOnInit() {
    this.loadOrganizations();
  }

  loadOrganizations() {
    this.loading = true;
    this.superAdminService.getOrganizations().subscribe({
      next: (data: any[]) => {
        this.organizations = data;
        this.applyFilter();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load organizations');
        this.cdr.detectChanges();
      }
    });
  }

  applyFilter() {
    const q = this.searchQuery.toLowerCase().trim();
    let result = [...this.organizations];

    if (q) {
      result = result.filter(o =>
        o.name?.toLowerCase().includes(q) ||
        o.slug?.toLowerCase().includes(q) ||
        o.supportEmail?.toLowerCase().includes(q)
      );
    }

    if (this.filterStatus === 'active') {
      result = result.filter(o => o.isActive);
    } else if (this.filterStatus === 'inactive') {
      result = result.filter(o => !o.isActive);
    }

    this.filteredOrganizations = result;
    this.cdr.detectChanges();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterStatus = '';
    this.applyFilter();
  }

  toggleOrg(id: string, name: string) {
    this.superAdminService.toggleOrganization(id).subscribe({
      next: (res: any) => {
        const org = this.organizations.find(o => o.id === id);
        if (org) {
          org.isActive = res.isActive;
          this.applyFilter();
        }
        this.toastr.success(res.message);
      },
      error: () => {
        this.toastr.error('Failed to toggle organization');
      }
    });
  }

  getAvatarColor(name: string): string {
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);
  }

  openOrganizationDetails(org: any) {
    const id = String(org?.id || '').trim();
    if (!id) return;

    this.detailsLoading = true;
    this.selectedOrg = null;
    this.cdr.detectChanges();

    this.superAdminService.getOrganizationById(id).subscribe({
      next: (res) => {
        this.selectedOrg = res;
        this.detailsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.detailsLoading = false;
        this.toastr.error('Failed to load organization details');
        this.cdr.detectChanges();
      }
    });
  }

  closeOrganizationDetails() {
    this.selectedOrg = null;
    this.detailsLoading = false;
    this.cdr.detectChanges();
  }

  mediaUrl(raw?: string | null): string {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `${this.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  orgLogoUrl(): string {
    return this.mediaUrl(this.selectedOrg?.logoUrl);
  }

  userPhotoUrl(photoUrl?: string): string {
    return this.mediaUrl(photoUrl);
  }

  logout() {
    this.authService.logout();
  }
}