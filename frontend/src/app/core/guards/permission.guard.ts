import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RoleRightsService } from '../services/role-rights.service';

/**
 * Route guard factory. Use:  `canActivate: [authGuard, permissionGuard('tickets')]`
 *
 * Waits for the permission map to load, then checks `can(module, 'view')`.
 * If denied, shows a toast and redirects to /dashboard (or /profile when the
 * denied module IS dashboard).
 */
export function permissionGuard(moduleKey: string): CanActivateFn {
  return async () => {
    const rr = inject(RoleRightsService);
    const router = inject(Router);
    const toastr = inject(ToastrService);

    await rr.ensureLoaded();

    if (rr.can(moduleKey, 'view')) return true;

    toastr.warning(`You don't have access to ${moduleKey.replace(/-/g, ' ')}.`);
    const fallback = moduleKey === 'dashboard' ? '/profile' : '/dashboard';
    return router.parseUrl(fallback);
  };
}
