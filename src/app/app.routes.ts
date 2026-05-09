import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { superAdminGuard } from './guards/super-admin-guard';
import { customerGuard } from './guards/customer-guard';
import { ContactsPageComponent } from './features/contacts/contacts-page/contacts-page';
import { TodoListComponent } from './features/todo/todo-panel/todo-list.component'; 

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
    path: 'contacts',
    component: ContactsPageComponent,
    canActivate: [authGuard]
  },
    {
    path: 'todo',
    component: TodoListComponent,
    canActivate: [authGuard]
  },
  // {
  //   path: 'todo',
  //   loadComponent: () =>
  //     import('./features/todo/todo-panel/todo-panel')
  //       .then(m => m.TodoPanelComponent),
  //   canActivate: [authGuard]
  // },

  {
  path: 'chat',
  loadComponent: () =>
    import('./features/chat/chat-page/chat-page')
      .then(m => m.ChatPageComponent),
  canActivate: [authGuard]
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
      .then(m => m.AgentsComponent),
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
      .then(m => m.ReportsComponent),
  canActivate: [authGuard]
},
{
  path: 'admin',
  loadComponent: () =>
  import('../features/super-admin/super-admin-dashboard/super-admin-dashboard')
      .then(m => m.SuperAdminDashboardComponent),
  canActivate: [superAdminGuard]
},
{
  path: 'admin/organizations',
  loadComponent: () =>
    import('../features/super-admin/organizations-list/organizations-list')
      .then(m => m.OrganizationsListComponent),
  canActivate: [superAdminGuard]
},
{
  path: 'admin/users',
  loadComponent: () =>
    import('../features/super-admin/all-users/all-users')
      .then(m => m.AllUsersComponent),
  canActivate: [superAdminGuard]
},
{
  path: 'customer',
  loadComponent: () =>
    import('./features/customer/customer-portal/customer-portal')
      .then(m => m.CustomerPortalComponent),
  canActivate: [authGuard]
},
{
  path: 'customer/ticket/:id',
  loadComponent: () =>
    import('./features/customer/customer-ticket-detail/customer-ticket-detail')
      .then(m => m.CustomerTicketDetailComponent),
  canActivate: [authGuard]
},
{
  path: 'kb',
  loadComponent: () =>
    import('./features/knowledge-base/kb-list/kb-list')
      .then(m => m.KbListComponent),
  canActivate: [authGuard]
},
{
  path: 'kb/create',
  loadComponent: () =>
    import('./features/knowledge-base/kb-create/kb-create')
      .then(m => m.KbCreateComponent),
  canActivate: [authGuard]
},
{
  path: 'kb/edit/:id',
  loadComponent: () =>
    import('./features/knowledge-base/kb-create/kb-create')
      .then(m => m.KbCreateComponent),
  canActivate: [authGuard]
},
{
  path: 'kb/:id',
  loadComponent: () =>
    import('./features/knowledge-base/kb-detail/kb-detail')
      .then(m => m.KbDetailComponent),
  canActivate: [authGuard]
},
{
  path: 'settings/templates',
  loadComponent: () =>
    import('./features/settings/ticket-templates/ticket-templates')
      .then(m => m.TicketTemplatesComponent),
  canActivate: [authGuard]
},
{
  path: 'settings',
  loadComponent: () =>
    import('./features/settings/settings-page/settings-page')
      .then(m => m.SettingsPageComponent),
  canActivate: [authGuard]
},
{
  path: 'settings',
  loadComponent: () =>
    import('./features/settings/settings-page/settings-page')
      .then(m => m.SettingsPageComponent),
  canActivate: [authGuard]
},
{
  path: 'audit',
  loadComponent: () =>
    import('./features/settings/audit-log/audit-log')
      .then(m => m.AuditLogComponent),
  canActivate: [authGuard]
},
{
  path: 'register-customer',
  loadComponent: () =>
    import('./features/auth/register-customer/register-customer')
      .then(m => m.RegisterCustomerComponent)
},
{
  path: 'agents/groups',
  loadComponent: () =>
    import('./features/agents/agent-groups/agent-groups')
      .then(m => m.AgentGroupsComponent),
  canActivate: [authGuard]
},
  {
    path: 'ai-dashboard',
    loadComponent: () =>
      import('./features/dashboard/ai-dashboard/ai-dashboard')
        .then(m => m.AIDashboardComponent),
    canActivate: [authGuard]
  },
{
  path: 'calendar',
  loadComponent: () =>
    import('./features/calendar/calendar-event/calendar-event')
      .then(m => m.CalendarEventComponent),
  canActivate: [authGuard]
},
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./auth/reset-password/reset-password')
        .then(m => m.ResetPasswordComponent)
  },
  { path: '**', redirectTo: 'login' }
];