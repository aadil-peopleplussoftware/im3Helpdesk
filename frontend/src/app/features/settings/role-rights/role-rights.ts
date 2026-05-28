import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {
  RoleRightsService,
  ModuleDef,
  PermissionRow,
  Matrix
} from '../../../core/services/role-rights.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';

type Action = 'canView' | 'canAdd' | 'canEdit' | 'canDelete' | 'canExport';

interface ActionMeta { key: Action; label: string; icon: string; }

@Component({
  selector: 'app-role-rights',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './role-rights.html',
  styleUrls: ['./role-rights.scss']
})
export class RoleRightsComponent implements OnInit {
  private svc = inject(RoleRightsService);
  private toastr = inject(ToastrService);

  modules = signal<ModuleDef[]>([]);
  roles = signal<string[]>([]);
  matrix = signal<Matrix>({});
  selectedRole = signal<string>('CompanyAdmin');
  search = signal<string>('');
  saving = signal(false);
  loading = signal(true);

  actions: ActionMeta[] = [
    { key: 'canView',   label: 'View',   icon: '👁️' },
    { key: 'canAdd',    label: 'Add',    icon: '➕' },
    { key: 'canEdit',   label: 'Edit',   icon: '✏️' },
    { key: 'canDelete', label: 'Delete', icon: '🗑️' },
    { key: 'canExport', label: 'Export', icon: '📤' }
  ];

  /** Modules grouped by category and filtered by search term. */
  groupedModules = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filtered = q
      ? this.modules().filter(m =>
          m.label.toLowerCase().includes(q) || m.key.includes(q))
      : this.modules();
    const groups: Record<string, ModuleDef[]> = {};
    for (const m of filtered) {
      (groups[m.category] ||= []).push(m);
    }
    return Object.entries(groups);
  });

  get currentMatrix(): Record<string, PermissionRow> {
    return this.matrix()[this.selectedRole()] || {};
  }

  get isReadOnly(): boolean {
    return this.selectedRole() === 'SuperAdmin';
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.svc.getCatalog().subscribe({
      next: (cat) => {
        this.modules.set(cat.modules);
        this.roles.set(cat.roles);
        this.loadMatrix();
      },
      error: () => {
        this.toastr.error('Failed to load module catalog');
        this.loading.set(false);
      }
    });
  }

  loadMatrix(): void {
    this.svc.getMatrix().subscribe({
      next: (m) => {
        this.matrix.set(m);
        this.loading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load role rights');
        this.loading.set(false);
      }
    });
  }

  selectRole(role: string): void {
    this.selectedRole.set(role);
  }

  toggle(moduleKey: string, action: Action): void {
    if (this.isReadOnly) return;
    const m = { ...this.matrix() };
    const role = this.selectedRole();
    const roleMap = { ...(m[role] || {}) };
    const row = { ...(roleMap[moduleKey]) } as any;
    row[action] = !row[action];
    // View=false implies all other actions false (defensive UX).
    if (action === 'canView' && row.canView === false) {
      row.canAdd = row.canEdit = row.canDelete = row.canExport = false;
    }
    // Any mutation action being enabled implies View=true.
    if (action !== 'canView' && row[action]) {
      row.canView = true;
    }
    roleMap[moduleKey] = row;
    m[role] = roleMap;
    this.matrix.set(m);
  }

  toggleAllForModule(moduleKey: string, value: boolean): void {
    if (this.isReadOnly) return;
    const m = { ...this.matrix() };
    const role = this.selectedRole();
    const roleMap = { ...(m[role] || {}) };
    roleMap[moduleKey] = {
      module: moduleKey,
      canView: value,
      canAdd: value,
      canEdit: value,
      canDelete: value,
      canExport: value
    };
    m[role] = roleMap;
    this.matrix.set(m);
  }

  toggleAllForAction(action: Action, value: boolean): void {
    if (this.isReadOnly) return;
    const m = { ...this.matrix() };
    const role = this.selectedRole();
    const roleMap = { ...(m[role] || {}) };
    for (const mod of this.modules()) {
      const row = { ...(roleMap[mod.key]) } as any;
      row[action] = value;
      if (action === 'canView' && !value) {
        row.canAdd = row.canEdit = row.canDelete = row.canExport = false;
      }
      if (action !== 'canView' && value) {
        row.canView = true;
      }
      roleMap[mod.key] = row;
    }
    m[role] = roleMap;
    this.matrix.set(m);
  }

  save(): void {
    if (this.isReadOnly) {
      this.toastr.info('SuperAdmin rights are fixed and cannot be changed.');
      return;
    }
    const role = this.selectedRole();
    const rows = Object.values(this.currentMatrix);
    this.saving.set(true);
    this.svc.save(role, rows).subscribe({
      next: () => {
        this.saving.set(false);
        this.toastr.success(`${role} permissions saved`);
        // Refresh current user's cached permissions in case admin edited their own role.
        this.svc.loadMine().subscribe();
      },
      error: () => {
        this.saving.set(false);
        this.toastr.error('Failed to save permissions');
      }
    });
  }

  resetRole(): void {
    if (this.isReadOnly) return;
    const role = this.selectedRole();
    if (!confirm(`Reset ${role} permissions to defaults?`)) return;
    this.svc.reset(role).subscribe({
      next: () => {
        this.toastr.success(`${role} reset to defaults`);
        this.loadMatrix();
        this.svc.loadMine().subscribe();
      },
      error: () => this.toastr.error('Failed to reset permissions')
    });
  }

  trackModule = (_: number, m: ModuleDef) => m.key;
  trackRole   = (_: number, r: string) => r;
  trackGroup  = (_: number, g: [string, ModuleDef[]]) => g[0];

  roleIcon(role: string): string {
    switch (role) {
      case 'SuperAdmin':   return '👑';
      case 'CompanyAdmin': return '🛡️';
      case 'Agent':        return '🧑‍💼';
      case 'Customer':     return '🙋';
      default:             return '👤';
    }
  }

  roleSubtitle(role: string): string {
    switch (role) {
      case 'SuperAdmin':   return 'Full system access (read-only here)';
      case 'CompanyAdmin': return 'Manages this workspace';
      case 'Agent':        return 'Handles tickets & customers';
      case 'Customer':     return 'Portal access only';
      default:             return '';
    }
  }
}
