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
import { SubscriptionService } from '../../../core/services/subscription';
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
  protected sub = inject(SubscriptionService);

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

  /**
   * Module → subscription-feature key mapping. When the module key already
   * matches the feature key (the common case) we don't need an entry here.
   * Modules listed in `ALWAYS_AVAILABLE` are shown regardless of plan
   * (foundational pieces every workspace needs).
   */
  private static readonly MODULE_FEATURE_MAP: Record<string, string> = {
    'integrations-email': 'email-integration',
    'integrations-slack': 'slack',
    'integrations-whatsapp': 'whatsapp',
  };
  private static readonly ALWAYS_AVAILABLE = new Set<string>([
    'customers', // sub-view of contacts; not gated as a paid feature
  ]);

  /** Feature key required to unlock a module on the current plan. */
  private featureForModule(key: string): string {
    return RoleRightsComponent.MODULE_FEATURE_MAP[key] ?? key;
  }

  /** True when the active subscription includes this module. */
  private isModuleInPlan(key: string): boolean {
    if (RoleRightsComponent.ALWAYS_AVAILABLE.has(key)) return true;
    if (!this.sub.loaded()) return true; // grace until features load
    return this.sub.hasFeature(this.featureForModule(key));
  }

  /** Modules included in the active plan (full catalog filtered by plan). */
  availableModules = computed<ModuleDef[]>(() =>
    this.modules().filter(m => this.isModuleInPlan(m.key)));

  /** Modules excluded by the current plan — surfaced as the "upgrade" hint. */
  lockedModules = computed<ModuleDef[]>(() =>
    this.modules().filter(m => !this.isModuleInPlan(m.key)));

  /** Modules grouped by category and filtered by plan + search term. */
  groupedModules = computed(() => {
    const q = this.search().trim().toLowerCase();
    const base = this.availableModules();
    const filtered = q
      ? base.filter(m =>
          m.label.toLowerCase().includes(q) || m.key.includes(q))
      : base;
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
    // Make sure the plan/feature list is hydrated so the page filters
    // correctly even if the user lands here on a deep link.
    this.sub.ensureLoaded().subscribe();
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
    // Only mutate modules visible on this plan — locked ones stay untouched.
    for (const mod of this.availableModules()) {
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
    // Only persist rows for modules included in the active plan; locked
    // modules keep whatever the org last saved (or fall back to defaults).
    const visibleKeys = new Set(this.availableModules().map(m => m.key));
    const rows = Object.values(this.currentMatrix).filter(r => visibleKeys.has(r.module));
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
