// (cleaned up: file now starts with imports only)
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
import { AuthService } from '../../features/auth/auth.service';
import { TodoPanelComponent } from '../../features/todo/todo-panel/todo-panel';
import { ChatService } from '../../core/services/chat.service';
import { TranslationService } from '../../core/services/translation'; // ✅ ADD
import { environment } from '../../../environments/environment';
import { GlobalCallNotificationService } from '../../core/services/global-call-notification.service';
import { GlobalCallPopupComponent } from '../../shared/components/global-call-popup/global-call-popup.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TodoPanelComponent,
    GlobalCallPopupComponent
  ],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss']
})
export class LayoutComponent implements OnInit, OnDestroy {
  public showProfileDropdown = false;
  public keyboardShortcutsEnabled = true;

  // Profile Dropdown Logic
  public toggleProfileDropdown(event: MouseEvent) {
    event.stopPropagation();
    this.showProfileDropdown = !this.showProfileDropdown;
    if (this.showProfileDropdown) {
      setTimeout(() => {
        window.addEventListener('click', this.closeProfileDropdown, { once: true });
        window.addEventListener('keydown', this.handleProfileDropdownEsc, { once: true });
      });
    }
  }

  public goToMainSettings() {
    this.showProfileDropdown = false;
    this.router.navigate(['/settings']);
  }

  public closeProfileDropdown = () => {
    this.showProfileDropdown = false;
    this.cdr.detectChanges();
    window.removeEventListener('keydown', this.handleProfileDropdownEsc, { capture: true } as any);
  };

  public handleProfileDropdownEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closeProfileDropdown();
    }
  };

  public goToProfileSettings() {
    this.showProfileDropdown = false;
    this.router.navigate(['/profile']);
  }

  public goToCustomerPortal() {
    this.showProfileDropdown = false;
    this.router.navigate(['/customer']);
  }

  private authService    = inject(AuthService);
  public  router         = inject(Router);
  private http           = inject(HttpClient);
  private cdr            = inject(ChangeDetectorRef);
  private destroy$       = new Subject<void>();
  private chatService    = inject(ChatService);
  private globalCallSvc  = inject(GlobalCallNotificationService);
  public  tr             = inject(TranslationService); // ✅ ADD — 'tr' naam se template mein use hoga

  isSidebarCollapsed = localStorage.getItem('im3_sidebar_collapsed') === 'true';
  chatUnreadCount    = 0;
  missedCallCount    = 0;
  userName           = '';
  userEmail          = '';
  userRole           = '';
  userPhotoUrl       = '';
  orgName            = '';
  isSuperAdmin       = false;
  isCustomer         = false;
  sidebarOpen        = false;

  notifications: any[] = [];
  unreadCount          = 0;
  showNotifDropdown    = false;

  searchQuery   = '';
  searchResults: any[] = [];

  todoCount     = 0;
  showTodoPanel = false;
  todos: any[]  = [];

  kbUnreadCount    = 0;
  kbUnreadArticles: any[] = [];
  showKbDropdown   = false;

  // ──────────────────────────────────────────────
  // Todo
  // ──────────────────────────────────────────────
  loadTodoCount() {
    this.http.get<any[]>(
      `${environment.apiUrl}/Todo`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.todos     = data;
        this.todoCount = data.filter(t => !t.isCompleted).length;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  toggleSidebarCollapse() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    localStorage.setItem('im3_sidebar_collapsed', String(this.isSidebarCollapsed));
  }

  toggleTodoPanel() {
    this.showTodoPanel = !this.showTodoPanel;
    if (this.showTodoPanel) this.loadTodoCount();
    this.cdr.detectChanges();
  }

  onTodoPanelChange() { this.loadTodoCount(); }

  // ──────────────────────────────────────────────
  // Knowledge Base
  // ──────────────────────────────────────────────
  loadKbUnread() {
    this.http.get<any>(
      `${environment.apiUrl}/KnowledgeBase/unread-count`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.kbUnreadCount    = data.count    || 0;
        this.kbUnreadArticles = data.articles || [];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  toggleKbDropdown() {
    this.showKbDropdown = !this.showKbDropdown;
    this.cdr.detectChanges();
  }

  goToKbArticle(id: string) {
    this.showKbDropdown = false;
    this.router.navigate(['/kb', id]);
    this.cdr.detectChanges();
  }

  // ──────────────────────────────────────────────
  // Missed Call Count
  // ──────────────────────────────────────────────
  loadMissedCallCount() {
    this.http.get<any>(
      `${environment.apiUrl}/CallLog/unread-missed`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.missedCallCount = data.count ?? data.missedCount ?? 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
  }

  // ──────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────
  ngOnInit() {
    const token = this.authService.getToken();
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.userName =
        payload['fullName'] ||
        payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload.email?.split('@')[0] || 'User';
      this.userEmail = payload.email || '';
      this.userRole  =
        payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
        payload.role || '';
      this.isSuperAdmin = this.userRole === 'SuperAdmin';
      this.isCustomer   = this.userRole === 'Customer';
    } catch {}

    const savedEmail = localStorage.getItem('im3_email');
    if (savedEmail && savedEmail === this.userEmail) {
      const saved = localStorage.getItem('im3_photo');
      if (saved) {
        this.userPhotoUrl = saved.startsWith('http') ? saved : environment.apiUrl.replace('/api','') + saved;
      }
    } else {
      localStorage.removeItem('im3_photo');
      this.userPhotoUrl = '';
    }

    this.chatService.connect();

    this.globalCallSvc.init(() => { this.router.navigate(['/chat']); });

    this.chatService.unreadCount$.pipe(takeUntil(this.destroy$)).subscribe(count => {
      this.chatUnreadCount = count; this.cdr.detectChanges();
    });

    this.chatService.missedCallCount$.pipe(takeUntil(this.destroy$)).subscribe(count => {
      this.missedCallCount = count; this.cdr.detectChanges();
    });

    this.chatService.callRejected$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      if (!d) return; setTimeout(() => this.loadMissedCallCount(), 800);
    });

    this.chatService.callEnded$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      if (!d) return; setTimeout(() => this.loadMissedCallCount(), 800);
    });

    this.chatService.incomingCall$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      if (!d) return; setTimeout(() => this.loadMissedCallCount(), 2000);
    });

    this.loadProfile();
    this.loadNotifications();
    this.startNotifPolling();
    this.loadTodoCount();
    this.loadKbUnread();
    this.loadMissedCallCount();

    interval(60000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadTodoCount());
    interval(60000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadKbUnread());
    interval(60000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadMissedCallCount());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.disconnect();
  }

  // ──────────────────────────────────────────────
  // Profile
  // ──────────────────────────────────────────────
  loadProfile() {
    this.http.get<any>(`${environment.apiUrl}/Profile`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        if (data.photoUrl) {
          this.userPhotoUrl = environment.apiUrl.replace('/api','') + data.photoUrl;
          localStorage.setItem('im3_photo', data.photoUrl);
        }
        if (data.fullName) this.userName = data.fullName;
        if (data.email) {
          this.userEmail = data.email;
          localStorage.setItem('im3_email', data.email);
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ──────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────
  loadNotifications() {
    this.http.get<any[]>(`${environment.apiUrl}/Notifications`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount   = data.filter(n => !n.isRead).length;
        this.cdr.detectChanges();
      }, error: () => {}
    });
  }

  loadUnreadCount() {
    this.http.get<any>(`${environment.apiUrl}/Notifications/unread-count`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.unreadCount = data.count || 0; this.cdr.detectChanges(); },
      error: () => {}
    });
  }

  startNotifPolling() {
    interval(30000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadUnreadCount());
  }

  toggleNotifDropdown() {
    this.showNotifDropdown = !this.showNotifDropdown;
    if (this.showNotifDropdown) this.loadNotifications();
    this.cdr.detectChanges();
  }

  markAllRead() {
    this.http.put(`${environment.apiUrl}/Notifications/mark-all-read`, {}, { headers: this.getHeaders() }).subscribe({
      next: () => {
        this.notifications.forEach(n => n.isRead = true);
        this.unreadCount = 0;
        this.cdr.detectChanges();
      }
    });
  }

  goToNotification(n: any) {
    this.showNotifDropdown = false;
    this.http.put(`${environment.apiUrl}/Notifications/${n.id}/read`, {}, { headers: this.getHeaders() }).subscribe({
      next: () => {
        const notif = this.notifications.find(x => x.id === n.id);
        if (notif) notif.isRead = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.cdr.detectChanges();
      }
    });
    Promise.resolve().then(() => {
      if (n.ticketId) { this.router.navigate(['/tickets', n.ticketId]); return; }
      const title = (n.title || '').toLowerCase();
      if (title.includes('ticket'))      this.router.navigate(['/tickets']);
      else if (title.includes('agent'))  this.router.navigate(['/agents']);
      else                               this.router.navigate(['/notifications']);
    });
  }

  // ──────────────────────────────────────────────
  // Search
  // ──────────────────────────────────────────────
  onSearch() {
    if (!this.searchQuery.trim()) { this.searchResults = []; this.cdr.detectChanges(); return; }
    this.http.get<any>(`${environment.apiUrl}/Search?q=${this.searchQuery}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.searchResults = [
          ...(data.tickets  || []).map((t: any) => ({ ...t, type: 'ticket', title: `#TN${t.ticketNumber} ${t.title}` })),
          ...(data.agents   || []).map((a: any) => ({ ...a, type: 'agent' })),
          ...(data.articles || []).map((k: any) => ({ ...k, type: 'kb' }))
        ].slice(0, 8);
        this.cdr.detectChanges();
      },
      error: () => { this.searchResults = []; }
    });
  }

  goToResult(r: any) {
    this.searchQuery = ''; this.searchResults = [];
    if (r.type === 'ticket')     this.router.navigate(['/tickets', r.id]);
    else if (r.type === 'agent') this.router.navigate(['/agents']);
    else if (r.type === 'kb')    this.router.navigate(['/kb', r.id]);
    this.cdr.detectChanges();
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────
  getAvatarColor(name: string): string {
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);
  }

  logout() { this.authService.logout(); }
}