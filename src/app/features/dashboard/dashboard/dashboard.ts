import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { Subject, interval, takeUntil, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DashboardChartsComponent } from '../dashboard-charts/dashboard-charts';
import { GlobalSearchComponent } from '../../../shared/global-search/global-search';
import { DashboardTrendComponent } from '../dashboard-trend/dashboard-trend';

// ─── Constants ───────────────────────────────────────────────────────────────
const API_BASE = 'https://localhost:7071/api';
const REFRESH_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatButtonModule, MatCardModule,
    MatToolbarModule, MatProgressSpinnerModule,
    DashboardChartsComponent, GlobalSearchComponent,
    DashboardTrendComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  // ── DI ─────────────────────────────────────────────────────────────────────
  private authService = inject(AuthService);
  public  router      = inject(Router);
  private http        = inject(HttpClient);
  private toastr      = inject(ToastrService);
  private cdr         = inject(ChangeDetectorRef);
  private destroy$    = new Subject<void>();

  // ── State ──────────────────────────────────────────────────────────────────
  userName    = '';
  userEmail   = '';
  userRole    = '';
  userInitials = '';
  unreadCount = 0;
  loading     = true;
  error       = false;   // ← NEW: show error state in template if needed

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

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.initUserFromToken();
    this.loadAll();

    // FIX 1: Auto-refresh every 60s using RxJS (was working, kept as-is)
    interval(REFRESH_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAll());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private initUserFromToken(): void {
    const token = this.authService.getToken();
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      // FIX 2: JWT claim key corrected — 'fullName' claim used (matches your
      //         backend JwtSettings where you set fullName, not 'name')
      this.userName =
        payload['fullName'] ||
        payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload.email?.split('@')[0] ||
        'User';

      this.userEmail = payload.email || '';

      this.userRole =
        payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
        payload.role || '';

      this.userInitials = this.userName
        .split(' ')
        .filter((n: string) => n.length)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    } catch {
      // token malformed — leave defaults
    }
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.authService.getToken()}`
    });
  }

  // ── FIX 3: Replace Promise.all + .toPromise() (deprecated) with forkJoin ──
  //           Each inner observable uses catchError(of(null)) so ONE failing
  //           request does NOT kill the entire dashboard load.
  loadAll(): void {
    const h = { headers: this.getHeaders() };

    forkJoin({
      stats: this.http.get<any>(`${API_BASE}/Dashboard/stats`, h).pipe(
        catchError(err => {
          // FIX 4: Show the actual server error in console so you can debug
          console.error('Stats error:', err.status, err.error);
          this.toastr.error('Could not load dashboard stats', 'Error');
          return of(null);
        })
      ),
      widgets: this.http.get<any>(`${API_BASE}/Dashboard/widgets`, h).pipe(
        catchError(err => {
          console.warn('Widgets error:', err.status);
          return of(null);
        })
      ),
      notif: this.http.get<any>(`${API_BASE}/Notifications/unread-count`, h).pipe(
        catchError(() => of({ count: 0 }))
      )
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ stats, widgets, notif }) => {
        if (stats)   this.stats      = stats;
        if (widgets) this.widgetData = widgets;
        this.unreadCount = notif?.count ?? 0;
        this.loading = false;
        this.error   = !stats;   // flag if stats still failed
        this.cdr.detectChanges();
      },
      error: () => {
        // forkJoin itself shouldn't error since each inner catches,
        // but just in case:
        this.loading = false;
        this.error   = true;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Template helpers ───────────────────────────────────────────────────────

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