import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, of, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ModuleDef {
  key: string;
  label: string;
  category: string;
  icon: string;
}

export interface PermissionRow {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export interface CatalogDto {
  modules: ModuleDef[];
  roles: string[];
  defaults: Record<string, Record<string, PermissionRow>>;
}

export type Matrix = Record<string, Record<string, PermissionRow>>;

interface MineResponse {
  isSuperAdmin: boolean;
  permissions: Record<string, PermissionRow>;
}

@Injectable({ providedIn: 'root' })
export class RoleRightsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/RoleRights`;

  myPermissions = signal<Record<string, PermissionRow>>({});
  isSuperAdminFlag = signal(false);
  loaded = signal(false);

  private inFlight: Promise<void> | null = null;

  /** Resolves once permissions are loaded; auto-triggers the first load. */
  ensureLoaded(): Promise<void> {
    if (this.loaded()) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = firstValueFrom(this.loadMine()).then(() => undefined).catch(() => undefined);
    return this.inFlight;
  }

  loadMine(): Observable<MineResponse> {
    return this.http.get<MineResponse>(`${this.base}/me`).pipe(
      tap(resp => {
        // Defer the signal writes so they don't flip values inside an
        // active change-detection pass — that would surface as
        // ExpressionChangedAfterItHasBeenCheckedError (NG0100) in any
        // template that gates UI on `roleRights.can(...)` or the
        // `*hasPermission` directive.
        queueMicrotask(() => {
          this.isSuperAdminFlag.set(!!resp?.isSuperAdmin);
          this.myPermissions.set(resp?.permissions || {});
          this.loaded.set(true);
          this.inFlight = null;
        });
      }),
      catchError(() => {
        queueMicrotask(() => {
          this.loaded.set(true);
          this.inFlight = null;
        });
        return of({ isSuperAdmin: false, permissions: {} } as MineResponse);
      })
    );
  }

  /** Called on logout so the next user starts clean. */
  clear(): void {
    this.myPermissions.set({});
    this.isSuperAdminFlag.set(false);
    this.loaded.set(false);
    this.inFlight = null;
  }

  // Catalog of modules whose access we DO gate. Unknown modules (not in this
  // list) default to allow so screens we haven't catalogued yet stay visible;
  // catalogued modules without an explicit row default to deny.
  private static readonly KNOWN_MODULES: ReadonlySet<string> = new Set([
    'dashboard','tickets','contacts','knowledge-base','chat','calendar',
    'notifications','todo','call-logs','reports','analytics-heatmap',
    'ai-insights','audit-log','agents','agent-groups','customers','leads',
    'ticket-templates','custom-fields','ticket-masters','settings',
    'organization-profile','holiday-setup','recycle-bin','role-rights',
    'integrations-email','integrations-slack','integrations-whatsapp',
  ]);

  /**
   * UI permission check.
   * - Before the map loads: allow (guards await `ensureLoaded()` so they never see this).
   * - SuperAdmin: always allow.
   * - Known module with no row in the matrix: deny (defense-in-depth — backend is the
   *   source of truth, but a missing row signals an explicit revoke from RoleRights).
   * - Unknown module (not in catalog): allow (screens we haven't enrolled yet).
   */
  can(module: string, action: 'view' | 'add' | 'edit' | 'delete' | 'export' = 'view'): boolean {
    if (this.isSuperAdminFlag()) return true;
    if (!this.loaded()) return true;
    const row = this.myPermissions()[module];
    if (!row) return !RoleRightsService.KNOWN_MODULES.has(module);
    switch (action) {
      case 'view':   return !!row.canView;
      case 'add':    return !!row.canAdd;
      case 'edit':   return !!row.canEdit;
      case 'delete': return !!row.canDelete;
      case 'export': return !!row.canExport;
    }
  }

  // ── Admin endpoints ──
  getCatalog(): Observable<CatalogDto> {
    return this.http.get<CatalogDto>(`${this.base}/catalog`);
  }
  getMatrix(): Observable<Matrix> {
    return this.http.get<Matrix>(this.base);
  }
  save(role: string, rows: PermissionRow[]): Observable<any> {
    return this.http.put(this.base, { role, rows });
  }
  reset(role?: string): Observable<any> {
    let params = new HttpParams();
    if (role) params = params.set('role', role);
    return this.http.post(`${this.base}/reset`, {}, { params });
  }
}
