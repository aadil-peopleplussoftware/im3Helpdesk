import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const setupOrgGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const token = route.queryParamMap.get('token');

  if (token) {
    return true;
  }

  return router.createUrlTree(['/setup-org-error']);
};