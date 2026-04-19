import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';
import { AgentService } from '../../../services/agent';
import { LayoutComponent } from '../../../shared/layout/layout';

@Component({
  selector: 'app-agents',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    RouterModule, LayoutComponent
  ],
  templateUrl: './agent-list.html',
  styleUrls: ['./agent-list.scss']
})
export class AgentsComponent implements OnInit {
  private agentService = inject(AgentService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);

  agents: any[] = [];
  filteredAgents: any[] = [];
  loading = true;
  searchQuery = '';
  activeTab = 'active';

  // ✅ Role checks
  isAdmin = false;
  isCompanyAdmin = false;

  ngOnInit() {
    const token = this.authService.getToken();
    if (token) {
      const p = JSON.parse(atob(token.split('.')[1]));
      const role = p[
        'http://schemas.microsoft.com/ws/2008/06/' +
        'identity/claims/role'
      ] || p.role || '';
      this.isAdmin = ['CompanyAdmin',
        'Agent'].includes(role);
      // ✅ Only CompanyAdmin can delete
      this.isCompanyAdmin = role === 'CompanyAdmin';
    }
    this.loadAgents();
  }

  private getHeaders() {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  loadAgents() {
    this.agentService.getAll().subscribe({
      next: (data: any[]) => {
        this.agents = data;
        this.filterAgents();
        this.loading = false;
        this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  getActiveCount(): number {
    return this.agents.filter(
      a => a.isActive !== false).length;
  }

  getInactiveCount(): number {
    return this.agents.filter(
      a => a.isActive === false).length;
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
      `https://localhost:7071/api/Agents/${agent.id}`,
      { headers: this.getHeaders() }
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
      `https://localhost:7071/api/Agents/${agent.id}/toggle-active`,
      {},
      { headers: this.getHeaders() }
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
}