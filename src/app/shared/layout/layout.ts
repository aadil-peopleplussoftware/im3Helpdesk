import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss']
})
export class LayoutComponent
  implements OnInit, OnDestroy {

  private authService = inject(AuthService);
  public router = inject(Router);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  // ✅ All properties declared
  userName = '';
  userEmail = '';
  userRole = '';
  userPhotoUrl = '';
  orgName = '';
  isSuperAdmin = false;
  isCustomer = false;

  notifications: any[] = [];
  unreadCount = 0;
  showNotifDropdown = false;

  searchQuery = '';
  searchResults: any[] = [];

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    const token = this.authService.getToken();
    if (!token) return;

    try {
      const payload = JSON.parse(
        atob(token.split('.')[1]));

      this.userName = payload[
        'http://schemas.xmlsoap.org/ws/2005/05/' +
        'identity/claims/name'
      ] || payload.email?.split('@')[0] || 'User';

      this.userEmail = payload.email || '';

      this.userRole = payload[
        'http://schemas.microsoft.com/ws/2008/06/' +
        'identity/claims/role'
      ] || payload.role || '';

      // ✅ Role flags
      this.isSuperAdmin =
        this.userRole === 'SuperAdmin';
      this.isCustomer =
        this.userRole === 'Customer';
    } catch {}

    // Load photo from localStorage instantly
    const saved = localStorage.getItem('im3_photo');
    if (saved) {
      this.userPhotoUrl = saved.startsWith('http')
        ? saved
        : 'https://localhost:7071' + saved;
    }

    // ✅ Load profile from API
    this.loadProfile();

    // ✅ Load notifications
    this.loadNotifications();

    // ✅ Poll every 30 seconds
    this.startNotifPolling();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ loadProfile method
  loadProfile() {
    this.http.get<any>(
      'https://localhost:7071/api/Profile',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        if (data.photoUrl) {
          this.userPhotoUrl =
            'https://localhost:7071' + data.photoUrl;
          localStorage.setItem(
            'im3_photo', data.photoUrl);
        }
        if (data.fullName)
          this.userName = data.fullName;
        if (data.email)
          this.userEmail = data.email;
        this.cdr.detectChanges();
      }
    });
  }

  loadNotifications() {
    this.http.get<any[]>(
      'https://localhost:7071/api/Notifications',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount = data.filter(
          n => !n.isRead).length;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadUnreadCount() {
    this.http.get<any>(
      'https://localhost:7071/api/Notifications' +
      '/unread-count',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.unreadCount = data.count || 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ✅ startNotifPolling method
  startNotifPolling() {
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadUnreadCount());
  }

  toggleNotifDropdown() {
    this.showNotifDropdown = !this.showNotifDropdown;
    if (this.showNotifDropdown)
      this.loadNotifications();
    this.cdr.detectChanges();
  }

  markAllRead() {
    this.http.put(
      'https://localhost:7071/api/Notifications' +
      '/mark-all-read',
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.notifications.forEach(
          n => n.isRead = true);
        this.unreadCount = 0;
        this.cdr.detectChanges();
      }
    });
  }

  goToNotification(n: any) {
    this.showNotifDropdown = false;

    this.http.put(
      `https://localhost:7071/api/Notifications` +
      `/${n.id}/read`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        const notif = this.notifications
          .find(x => x.id === n.id);
        if (notif) notif.isRead = true;
        this.unreadCount = Math.max(
          0, this.unreadCount - 1);
        this.cdr.detectChanges();
      }
    });

    Promise.resolve().then(() => {
      if (n.ticketId) {
        this.router.navigate(
          ['/tickets', n.ticketId]);
        return;
      }
      const title = (n.title || '').toLowerCase();
      if (title.includes('ticket'))
        this.router.navigate(['/tickets']);
      else if (title.includes('agent'))
        this.router.navigate(['/agents']);
      else
        this.router.navigate(['/notifications']);
    });
  }

  // ✅ Search methods
  onSearch() {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      this.cdr.detectChanges();
      return;
    }

    this.http.get<any>(
      `https://localhost:7071/api/Search` +
      `?q=${this.searchQuery}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.searchResults = [
          ...(data.tickets || []).map(
            (t: any) => ({
              ...t,
              type: 'ticket',
              title: `#TN${t.ticketNumber} ${t.title}`
            })),
          ...(data.agents || []).map(
            (a: any) => ({
              ...a,
              type: 'agent'
            })),
          ...(data.articles || []).map(
            (k: any) => ({
              ...k,
              type: 'kb'
            }))
        ].slice(0, 8);
        this.cdr.detectChanges();
      },
      error: () => {
        this.searchResults = [];
      }
    });
  }

  goToResult(r: any) {
    this.searchQuery = '';
    this.searchResults = [];

    if (r.type === 'ticket')
      this.router.navigate(['/tickets', r.id]);
    else if (r.type === 'agent')
      this.router.navigate(['/agents']);
    else if (r.type === 'kb')
      this.router.navigate(['/kb', r.id]);

    this.cdr.detectChanges();
  }

  // ✅ Helper methods
  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#eab308',
      '#22c55e','#3b82f6','#8b5cf6','#ec4899'
    ];
    const idx = (name?.charCodeAt(0) || 0)
      % colors.length;
    return colors[idx];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ')
      .map(n => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  logout() {
    this.authService.logout();
  }
}