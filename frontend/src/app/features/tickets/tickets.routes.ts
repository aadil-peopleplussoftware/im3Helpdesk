import { Routes } from '@angular/router';

export const TICKETS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./ticket-list/ticket-list').then(m => m.TicketListComponent)
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./ticket-detail/ticket-detail').then(m => m.TicketDetailComponent)
  }
];
