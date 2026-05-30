import {
  Component, OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { AgentService } from '../../../core/services/agent';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    RouterModule, LayoutComponent, HasPermissionDirective
  ],
  templateUrl: './agent-list.html',
  styleUrls: ['./agent-list.scss']
})
export class AgentsComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);
  private agentService = inject(AgentService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  readonly baseUrl = environment.baseUrl;
  private http = inject(HttpClient);

  agents: any[] = [];
  filteredAgents: any[] = [];
  loading = true;
  uploading = false;
  searchQuery = '';
  activeTab = 'active';

  // ✅ Role checks
  isAdmin = false;
  isCompanyAdmin = false;

  ngOnInit() {
    const role = this.authService.getUserRole();
    this.isAdmin = ['CompanyAdmin', 'Agent'].includes(role);
    this.isCompanyAdmin = role === 'CompanyAdmin';

    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) this.searchQuery = q;

    this.loadAgents();
  }

  loadAgents() {
    this.loading = true;

    // Always render users first. Group lookup is enrichment only.
    this.agentService.getAll().subscribe({
      next: (data: any[]) => {
        this.agents = data.map(a => ({
          ...this.normalizeAgent(a),
          groupName: ''
        }));
        this.alignDefaultTabWithData();
        this.filterAgents();
        this.loading = false;
        this.cdr.detectChanges();

        this.enrichGroupNames();
      },
      error: () => {
        this.agents = [];
        this.filteredAgents = [];
        this.loading = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error('Users could not be loaded. Please try again.')
        );
      }
    });
  }

  private enrichGroupNames() {
    this.http.get<any>(`${environment.apiUrl}/AgentGroups`).subscribe({
      next: (groupsRaw) => {
        const groups = Array.isArray(groupsRaw)
          ? groupsRaw
          : (groupsRaw?.data ?? groupsRaw?.items ?? []);

        if (!Array.isArray(groups) || groups.length === 0) return;

        this.agents = this.agents.map(agent => {
          const agentIdLower = String(agent.id || '').toLowerCase();
          const agentGroups = groups
            .filter((g: any) => {
              const rawIds = g?.memberIds ?? g?.MemberIds ?? [];
              const ids = Array.isArray(rawIds) ? rawIds : [];
              return ids.some((mid: any) =>
                String(mid).toLowerCase() === agentIdLower);
            })
            .map((g: any) => g?.name ?? g?.Name)
            .filter((name: any) => !!name);

          return { ...agent, groupName: agentGroups.join(', ') };
        });

        this.filterAgents();
        this.cdr.detectChanges();
      },
      error: () => {
        // Group mapping failure should never hide users list.
      }
    });
  }

  filterAgents() {
    let result = [...this.agents];

    // Tab filter
    if (this.activeTab === 'active')
      result = result.filter(a =>
        a.isActive !== false);
    else
      result = result.filter(a =>
        a.isActive === false);

    // Search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(a =>
        a.fullName?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q));
    }

    this.filteredAgents = result;
  }

  getActiveCount(): number {
    return this.agents.filter(
      a => a.isActive !== false).length;
  }

  getInactiveCount(): number {
    return this.agents.filter(
      a => a.isActive === false).length;
  }

  private normalizeAgent(agent: any): any {
    const isActiveRaw = agent?.isActive ?? agent?.IsActive;
    const isActive = typeof isActiveRaw === 'boolean'
      ? isActiveRaw
      : String(isActiveRaw).toLowerCase() !== 'false';

    return {
      ...agent,
      id: agent?.id ?? agent?.Id ?? '',
      fullName: agent?.fullName ?? agent?.FullName ?? '',
      email: agent?.email ?? agent?.Email ?? '',
      role: agent?.role ?? agent?.Role ?? 'Agent',
      lastLoginAt: agent?.lastLoginAt ?? agent?.LastLoginAt ?? null,
      photoUrl: agent?.photoUrl ?? agent?.PhotoUrl ?? '',
      isActive
    };
  }

  private alignDefaultTabWithData() {
    if (this.searchQuery?.trim()) return;

    const activeCount = this.agents.filter(a => a.isActive !== false).length;
    const inactiveCount = this.agents.filter(a => a.isActive === false).length;

    if (this.activeTab === 'active' && activeCount === 0 && inactiveCount > 0) {
      this.activeTab = 'inactive';
      return;
    }

    if (this.activeTab === 'inactive' && inactiveCount === 0 && activeCount > 0) {
      this.activeTab = 'active';
    }
  }

  getRoleLabel(role: number | string): string {
    const labels: any = {
      0: 'Super Admin',
      1: 'Company Admin',
      2: 'Agent',
      3: 'Customer',
      'SuperAdmin': 'Super Admin',
      'CompanyAdmin': 'Administrator',
      'Agent': 'Agent',
      'Customer': 'Customer'
    };
    return labels[role] || 'Agent';
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#22c55e',
      '#3b82f6','#8b5cf6','#ec4899'
    ];
    return colors[
      (name?.charCodeAt(0) || 0) % colors.length];
  }

  getTimeAgo(date: string): string {
    const d = new Date(date);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(
      diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365)
      return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  }

  editAgent(a: any) {
    this.router.navigate(['/agents', a.id, 'edit']);
  }

  // ✅ Delete only for CompanyAdmin
  deleteAgent(agent: any) {
    if (!this.isCompanyAdmin) {
      Promise.resolve().then(() =>
        this.toastr.error(
          'Only Company Admin can delete agents')
      );
      return;
    }

    if (!confirm(
      `Delete agent ${agent.fullName}?`)) return;

    this.http.delete(
      `${environment.apiUrl}/Agents/${agent.id}`
    ).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success('Agent deleted')
        );
        this.loadAgents();
      },
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed to delete')
        )
    });
  }

  toggleActive(agent: any) {
    this.http.put(
      `${environment.apiUrl}/Agents/${agent.id}/toggle-active`,
      {}
    ).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success(
            `Agent ${agent.isActive
              ? 'deactivated' : 'activated'}`)
        );
        this.loadAgents();
      }
    });
  }

  exportCsv() {
    const csv = [
      ['Name', 'Email', 'Role', 'Group', 'Status'],
      ...this.agents.map(a => [
        a.fullName, a.email,
        this.getRoleLabel(a.role),
        a.groupName || '',
        a.isActive !== false
          ? 'Active' : 'Inactive'
      ])
    ].map(r => r.map(
      v => `"${v}"`).join(',')).join('\n');

    const blob = new Blob([csv],
      { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agents.csv';
    a.click();
  }

  downloadBulkTemplate() {
    const csv = [
      ['FullName', 'Email', 'Role', 'PhoneNumber'],
      ['Aadil Khan', 'aadil.agent@example.com', 'Agent', '+91-9000000001'],
      ['Sara Customer', 'sara.customer@example.com', 'Customer', '+91-9000000002'],
      ['Nora Admin', 'nora.admin@example.com', 'Administrator', '+91-9000000003']
    ].map(r => r.map(v => `"${v}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users-bulk-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  onBulkFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!(name.endsWith('.xlsx') || name.endsWith('.csv'))) {
      this.toastr.error('Please upload only .xlsx or .csv file.');
      input.value = '';
      return;
    }

    this.uploading = true;

    this.agentService.bulkImport(file, true).subscribe({
      next: (res: any) => {
        this.finishBulkUpload(input);

        const total = Number(res?.totalRows || 0);
        const created = Number(res?.createdCount || 0);
        const failed = Number(res?.failedCount || 0);

        this.toastr.success(
          `Import complete: ${created} created, ${failed} failed out of ${total}.`
        );

        if (failed > 0 && Array.isArray(res?.results)) {
          const failRows = res.results
            .filter((x: any) => !x.success)
            .slice(0, 3)
            .map((x: any) => `Row ${x.rowNumber}: ${x.message}`)
            .join(' | ');

          this.toastr.warning(
            failRows || 'Some rows failed. Please check downloaded report.'
          );
        }

        if (Array.isArray(res?.results) && res.results.length > 0) {
          this.downloadBulkImportReport(res.results);
        }

        this.loadAgents();
      },
      error: (err: any) => {
        this.finishBulkUpload(input);

        const message = err?.error?.message
          || (err?.status === 405
            ? 'Bulk import API method not available. Please restart backend and try again.'
            : 'Bulk import failed.');

        this.toastr.error(message);
      }
    });
  }

  private finishBulkUpload(input: HTMLInputElement) {
    input.value = '';
    // Defer flag reset to next macrotask to avoid NG0100 in dev mode.
    setTimeout(() => {
      this.uploading = false;
    });
  }

  private downloadBulkImportReport(results: any[]) {
    const rows = [
      ['RowNumber', 'Email', 'Role', 'Status', 'Message', 'TempPassword', 'InviteEmailSent'],
      ...results.map((r: any) => [
        String(r.rowNumber ?? ''),
        String(r.email ?? ''),
        String(r.role ?? ''),
        r.success ? 'Created' : 'Failed',
        String(r.message ?? ''),
        String(r.tempPassword ?? ''),
        String(r.inviteEmailSent ?? '')
      ])
    ];

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-bulk-import-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}