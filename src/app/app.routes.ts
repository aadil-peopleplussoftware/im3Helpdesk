import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { superAdminGuard } from './guards/super-admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login')
        .then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register')
        .then(m => m.RegisterComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password')
        .then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email')
        .then(m => m.VerifyEmailComponent)
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./features/onboarding/onboarding-wizard/onboarding-wizard')
        .then(m => m.OnboardingWizardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard/dashboard')
        .then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tickets',
    loadComponent: () =>
      import('./features/tickets/ticket-list/ticket-list')
        .then(m => m.TicketListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tickets/create',
    loadComponent: () =>
      import('./features/tickets/ticket-create/ticket-create')
        .then(m => m.TicketCreateComponent),
    canActivate: [authGuard]
  },
  {
    path: 'tickets/:id',
    loadComponent: () =>
      import('./features/tickets/ticket-detail/ticket-detail')
        .then(m => m.TicketDetailComponent),
    canActivate: [authGuard]
  },
  {
  path: 'agents',
  loadComponent: () =>
    import('./features/agents/agent-list/agent-list')
      .then(m => m.AgentListComponent),
  canActivate: [authGuard]
},
{
  path: 'agents/invite',
  loadComponent: () =>
    import('./features/agents/agent-invite/agent-invite')
      .then(m => m.AgentInviteComponent),
  canActivate: [authGuard]
},
{
  path: 'profile',
  loadComponent: () =>
    import('./features/profile/profile-page/profile-page')
      .then(m => m.ProfilePageComponent),
  canActivate: [authGuard]
},
{
  path: 'notifications',
  loadComponent: () =>
    import('./features/notifications/notifications-page/notifications-page')
      .then(m => m.NotificationsPageComponent),
  canActivate: [authGuard]
},
{
  path: 'reports',
  loadComponent: () =>
    import('./features/reports/reports-page/reports-page')
      .then(m => m.ReportsPageComponent),
  canActivate: [authGuard]
},


// Routes mein add karo:
{
  path: 'admin',
  loadComponent: () =>
    import('./features/super-admin/super-admin-dashboard/super-admin-dashboard')
      .then(m => m.SuperAdminDashboardComponent),
  canActivate: [superAdminGuard]
},
{
  path: 'admin/organizations',
  loadComponent: () =>
    import('./features/super-admin/organizations-list/organizations-list')
      .then(m => m.OrganizationsListComponent),
  canActivate: [superAdminGuard]
},
{
  path: 'admin/users',
  loadComponent: () =>
    import('./features/super-admin/all-users/all-users')
      .then(m => m.AllUsersComponent),
  canActivate: [superAdminGuard]
},

  { path: '**', redirectTo: 'login' }
];