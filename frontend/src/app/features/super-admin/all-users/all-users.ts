import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { SuperAdminService } from '../../../core/services/super-admin';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-all-users',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    FormsModule, LayoutComponent
  ],
  templateUrl: './all-users.html',
  styleUrls: ['./all-users.scss']
})
export class AllUsersComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  allUsers: any[] = [];
  filteredUsers: any[] = [];
  loading = true;
  searchQuery = '';
  filterRole = '';
  detailsLoading = false;
  selectedUser: any = null;
  readonly baseUrl = environment.baseUrl;

  roleOptions = ['SuperAdmin', 'CompanyAdmin', 'Agent', 'Customer'];

  get totalCount()    { return this.allUsers.length; }
  getRoleCount(role: string) {
    return this.allUsers.filter(u => u.role === role).length;
  }

  ngOnInit() { this.loadUsers(); }

  loadUsers() {
    this.loading = true;
    this.superAdminService.getAllUsers().subscribe({
      next: (data: any[]) => {
        this.allUsers = data;
        this.applyFilter();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load users');
        this.cdr.detectChanges();
      }
    });
  }

  applyFilter() {
    const q = this.searchQuery.toLowerCase().trim();
    let result = [...this.allUsers];

    if (q) {
      result = result.filter(u =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.organizationName?.toLowerCase().includes(q) ||
        u.organization?.name?.toLowerCase().includes(q)
      );
    }

    if (this.filterRole) {
      result = result.filter(u => u.role === this.filterRole);
    }

    this.filteredUsers = result;
    this.cdr.detectChanges();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterRole = '';
    this.applyFilter();
  }

  getRoleStyle(role: string): { bg: string; color: string } {
    const map: any = {
      'SuperAdmin':   { bg: '#f3e8ff', color: '#7c3aed' },
      'CompanyAdmin': { bg: '#e0f2fe', color: '#0369a1' },
      'Agent':        { bg: '#dcfce7', color: '#15803d' },
      'Customer':     { bg: '#f3f4f6', color: '#374151' }
    };
    return map[role] || { bg: '#f3f4f6', color: '#374151' };
  }

  getAvatarColor(name: string): string {
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);
  }

  openUserDetails(user: any) {
    const id = String(user?.id || '').trim();
    if (!id) return;

    this.detailsLoading = true;
    this.selectedUser = null;
    this.cdr.detectChanges();

    this.superAdminService.getUserById(id).subscribe({
      next: (res) => {
        this.selectedUser = res;
        this.detailsLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.detailsLoading = false;
        this.toastr.error('Failed to load user details');
        this.cdr.detectChanges();
      }
    });
  }

  closeUserDetails() {
    this.selectedUser = null;
    this.detailsLoading = false;
    this.cdr.detectChanges();
  }

  mediaUrl(raw?: string | null): string {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `${this.baseUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  }

  userPhotoUrl(): string {
    return this.mediaUrl(this.selectedUser?.photoUrl);
  }

  orgLogoUrl(): string {
    return this.mediaUrl(this.selectedUser?.organization?.logoUrl);
  }

  organizationName(user: any): string {
    return user?.organizationName || user?.organization?.name || '—';
  }

  logout() { this.authService.logout(); }
}