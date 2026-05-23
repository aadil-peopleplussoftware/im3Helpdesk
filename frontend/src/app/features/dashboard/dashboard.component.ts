import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, interval, takeUntil, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DashboardChartsComponent } from './dashboard-charts/dashboard-charts';
import { DashboardTrendComponent } from './dashboard-trend/dashboard-trend';
import { LayoutComponent } from '../../layouts/main-layout/layout';
import { environment } from '../../../environments/environment';

const API_BASE = environment.apiUrl;
const REFRESH_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatButtonModule, MatCardModule,
    MatToolbarModule, MatProgressSpinnerModule,
    DashboardChartsComponent,
    DashboardTrendComponent,
    LayoutComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {

  private authService = inject(AuthService);
  public  router      = inject(Router);
  private http        = inject(HttpClient);
  private toastr      = inject(ToastrService);
  private cdr         = inject(ChangeDetectorRef);
  private destroy$    = new Subject<void>();

  userName    = '';
  userEmail   = '';
  userRole    = '';
  userInitials = '';
  loading     = true;
  error       = false;

  widgetData: any = null;

  stats: any = {
    totalTickets: 0, openTickets: 0,
    inProgressTickets: 0, resolvedTickets: 0,
    closedTickets: 0,
    totalAgents: 0, newTicketsToday: 0,
    newTicketsThisWeek: 0, avgResolutionHours: '0.0',
    lowPriority: 0, mediumPriority: 0,
    highPriority: 0, criticalPriority: 0,
    trialDaysLeft: 30, organizationName: '',
    recentTickets: []
  };

  ngOnInit(): void {
    this.initUserFromToken();
    this.loadAll();

    interval(REFRESH_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initUserFromToken(): void {
    this.userName = this.authService.getUserName() || 'User';
    this.userRole = this.authService.getUserRole() || '';
    this.userEmail = '';
    this.userInitials = this.userName
      .split(' ')
      .filter((n: string) => n.length)
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  loadAll(): void {
    forkJoin({
      stats: this.http.get<any>(`${API_BASE}/Dashboard/stats`).pipe(
        catchError(err => {
          console.error('Stats error:', err.status, err.error);
          this.toastr.error('Could not load dashboard stats', 'Error');
          return of(null);
        })
      ),
      widgets: this.http.get<any>(`${API_BASE}/Dashboard/widgets`).pipe(
        catchError(err => {
          console.warn('Widgets error:', err.status);
          return of(null);
        })
      )
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ stats, widgets }) => {
        if (stats)   this.stats      = stats;
        if (widgets) this.widgetData = widgets;
        this.loading = false;
        this.error   = !stats;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.error   = true;
        this.cdr.detectChanges();
      }
    });
  }

  getTimeAgo(date: string): string {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  getStatusClass(status: any): string {
    const map: Record<string, string> = {
      '0': 'open', '1': 'inprogress', '2': 'resolved', '3': 'closed',
      'Open': 'open', 'InProgress': 'inprogress',
      'Resolved': 'resolved', 'Closed': 'closed'
    };
    return map[String(status)] ?? 'open';
  }

  getStatusLabel(status: any): string {
    const map: Record<string, string> = {
      '0': 'Open', '1': 'In Progress', '2': 'Resolved', '3': 'Closed',
      'Open': 'Open', 'InProgress': 'In Progress',
      'Resolved': 'Resolved', 'Closed': 'Closed'
    };
    return map[String(status)] ?? 'Open';
  }

  getTrialColor(): string {
    const d = this.stats.trialDaysLeft ?? 0;
    if (d > 15) return '#4caf50';
    if (d > 5)  return '#ff9800';
    return '#f44336';
  }

  logout(): void {
    this.authService.logout();
  }
}
