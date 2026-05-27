// (cleaned up: file now starts with imports only)
import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ChangeDetectorRef, inject,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  Subject, interval, of
} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  filter
} from 'rxjs/operators';
import { AuthService } from '../../features/auth/auth.service';
import { TodoPanelComponent } from '../../features/todo/todo-panel/todo-panel';
import { ChatService } from '../../core/services/chat.service';
import { TranslationService } from '../../core/services/translation'; // ✅ ADD
import { environment } from '../../../environments/environment';
import { GlobalCallNotificationService } from '../../core/services/global-call-notification.service';
import { GlobalCallPopupComponent } from '../../shared/components/global-call-popup/global-call-popup.component';
import { TopbarContextService } from '../../core/services/topbar-context.service';
import { OrgContextService } from '../../core/services/org-context.service';

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
  @ViewChild('globalSearchInput')
  globalSearchInput?: ElementRef<HTMLInputElement>;
  public showProfileDropdown = false;
  public keyboardShortcutsEnabled = true;

  // Prevent layout shift animation on route navigation.
  // We only enable transitions after the first render.
  public animationsReady = false;

  // Profile Dropdown Logic
  public toggleProfileDropdown(event: MouseEvent) {
    event.stopPropagation();
    this.showProfileDropdown = !this.showProfileDropdown;
    if (this.showProfileDropdown) {
      if (this.isCompanyAdmin) this.loadMailboxSetupStatus();
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

  public goToOrganizationProfile() {
    this.showProfileDropdown = false;
    this.router.navigate(['/organization-profile']);
  }

  public goToRecycleBin() {
    this.showProfileDropdown = false;
    this.router.navigate(['/recycle-bin']);
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
  public  topbarCtx      = inject(TopbarContextService);
  private orgContext     = inject(OrgContextService);
  isSidebarCollapsed = (() => {
    const saved = localStorage.getItem('im3_sidebar_collapsed');
    // Freshdesk-style compact sidebar by default (only when user has never chosen).
    if (saved === null) return true;
    return saved === 'true';
  })();

  isCompanyAdmin = false;
  smtpSetupIncomplete = false;
  smtpSetupChecked = false;
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

  // ──────────────────────────────────────────────
  // Global Search (Topbar)
  // ──────────────────────────────────────────────
  searchQuery = '';
  searchPanelOpen = false;
  searchLoading = false;

  searchTab: 'all' | 'tickets' | 'contacts' | 'users' | 'solutions' = 'all';

  activePageTitle = 'Dashboard';
  activePageKey: 'dashboard' | 'tickets' | 'contacts' | 'chat' | 'todo' | 'kb' | 'agents' | 'notifications' | 'calendar' | 'reports' | 'settings' | 'other' = 'dashboard';

  private search$ = new Subject<string>();
  private searchData: any = null;
  private flatSearchResults: Array<{
    type: 'ticket' | 'contact' | 'user' | 'article';
    id: string;
    title: string;
    subtitle?: string;
    meta?: string;
  }> = [];

  recentSearches: string[] = [];
  recentViewed: Array<{
    type: 'ticket' | 'contact' | 'user' | 'article';
    id: string;
    title: string;
    subtitle?: string;
    meta?: string;
  }> = [];

  todoCount     = 0;
  showTodoPanel = false;
  todos: any[]  = [];

  kbUnreadCount    = 0;
  kbUnreadArticles: any[] = [];
  showKbDropdown   = false;

  birthdaySummary = {
    today: '',
    tomorrow: '',
    todayCount: 0,
    tomorrowCount: 0
  };
  private birthdayLastLoadedAt = 0;

  showBirthdayDropdown = false;
  birthdayItems: Array<{
    userId: string;
    fullName: string;
    photoUrl?: string | null;
    when: 'today' | 'tomorrow';
    date: string;
  }> = [];

  myTicketCounts = {
    open: 0,
    inProgress: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
    total: 0
  };

  profileCompletion = 100;

  superAdminPendingLeadsCount = 0;

  // ──────────────────────────────────────────────
  // Todo
  // ──────────────────────────────────────────────
  loadTodoCount() {
    this.http.get<any>(
      `${environment.apiUrl}/Todo/unread-count`
    ).subscribe({
      next: (data) => {
        this.todoCount = data?.count ?? 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onTodoCountChanged(count: number) {
    this.todoCount = Number.isFinite(count as any)
      ? Number(count)
      : this.todoCount;
    this.cdr.detectChanges();
  }

  loadMyTicketCounts() {
    this.http.get<any>(
      `${environment.apiUrl}/Tickets/my-status-counts`
    ).subscribe({
      next: (data) => {
        this.myTicketCounts = {
          open: data?.open ?? 0,
          inProgress: data?.inProgress ?? 0,
          pending: data?.pending ?? 0,
          resolved: data?.resolved ?? 0,
          closed: data?.closed ?? 0,
          total: data?.total ?? 0
        };
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  refreshHeaderCounts() {
    if (this.isSuperAdmin) {
      this.loadSuperAdminPendingLeadsCount();
      return;
    }

    // Topbar modules exist only for internal users.
    if (!this.isCustomer) {
      this.loadUnreadCount();
      this.loadTodoCount();
      this.loadKbUnread();
      this.loadBirthdayReminders();
      this.loadMissedCallCount();
    }

    // Ticket counts are useful for both internal users and customers.
    this.loadMyTicketCounts();
  }

  private loadSuperAdminPendingLeadsCount() {
    // Avoid depending on /admin/leads/summary (may not exist on older backends).
    // Use the list endpoint and compute pending count.
    this.http.get<any[]>(`${environment.apiUrl}/admin/leads`).subscribe({
      next: (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        // Backend stores numeric enum values; 0 == Pending.
        this.superAdminPendingLeadsCount = list.filter(x => x?.status === 0).length;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ──────────────────────────────────────────────
  // Birthdays (topbar reminder)
  // ──────────────────────────────────────────────
  get birthdayBadgeCount(): number {
    return (this.birthdaySummary.todayCount || 0) +
           (this.birthdaySummary.tomorrowCount || 0);
  }

  get birthdayTooltip(): string {
    const t = this.birthdaySummary.todayCount || 0;
    const tm = this.birthdaySummary.tomorrowCount || 0;
    if (t <= 0 && tm <= 0) return 'No upcoming birthdays';
    if (t > 0 && tm > 0) return `Birthdays: ${t} today, ${tm} tomorrow`;
    if (t > 0) return `Birthdays today: ${t}`;
    return `Birthdays tomorrow: ${tm}`;
  }

  private readonly apiBaseUrl = environment.apiUrl.replace('/api', '');

  getBirthdayPhotoUrl(photoUrl?: string | null): string {
    if (!photoUrl) return '';
    return photoUrl.startsWith('http') ? photoUrl : `${this.apiBaseUrl}${photoUrl}`;
  }

  toggleBirthdayDropdown(event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.showBirthdayDropdown = !this.showBirthdayDropdown;
    if (this.showBirthdayDropdown) {
      this.loadBirthdayReminders(true);
      setTimeout(() => {
        window.addEventListener('click', this.closeBirthdayDropdown, { once: true });
        window.addEventListener('keydown', this.handleBirthdayDropdownEsc, { once: true });
      });
    }
    this.cdr.detectChanges();
  }

  closeBirthdayDropdown = () => {
    this.showBirthdayDropdown = false;
    this.cdr.detectChanges();
    window.removeEventListener('keydown', this.handleBirthdayDropdownEsc, { capture: true } as any);
  };

  handleBirthdayDropdownEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closeBirthdayDropdown();
  };

  goToCalendarFromBirthday() {
    this.showBirthdayDropdown = false;
    this.router.navigate(['/calendar']);
    this.cdr.detectChanges();
  }

  loadBirthdayReminders(force = false) {
    // Keep this lightweight but retry-safe.
    const now = Date.now();
    if (!force && now - this.birthdayLastLoadedAt < 30 * 1000) return;

    this.http.get<any>(
      `${environment.apiUrl}/Birthdays/reminders`
    ).subscribe({
      next: (data) => {
        this.birthdayLastLoadedAt = now;
        const items = Array.isArray(data?.items) ? data.items : [];
        this.birthdayItems = items.map((i: any) => ({
          userId: i.userId,
          fullName: i.fullName,
          photoUrl: i.photoUrl,
          when: i.when,
          date: i.date
        }));

        const todayCount = Number(data?.todayCount ?? 0);
        const tomorrowCount = Number(data?.tomorrowCount ?? 0);
        this.birthdaySummary = {
          today: data?.today ?? '',
          tomorrow: data?.tomorrow ?? '',
          todayCount: Number.isFinite(todayCount) ? todayCount : 0,
          tomorrowCount: Number.isFinite(tomorrowCount) ? tomorrowCount : 0
        };
        this.cdr.detectChanges();
      },
      error: () => {
        // Allow retry on next refresh.
        if (force) this.birthdayLastLoadedAt = 0;
      }
    });
  }

  toggleSidebarCollapse() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    localStorage.setItem('im3_sidebar_collapsed', String(this.isSidebarCollapsed));
  }

  toggleTodoPanel() {
    this.showTodoPanel = !this.showTodoPanel;
    // Keep badge fresh when opening.
    if (this.showTodoPanel) this.loadTodoCount();
    this.cdr.detectChanges();
  }

  onTodoPanelChange() { this.loadTodoCount(); }

  // ──────────────────────────────────────────────
  // Knowledge Base
  // ──────────────────────────────────────────────
  loadKbUnread() {
    this.http.get<any>(
      `${environment.apiUrl}/KnowledgeBase/unread-count`
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
      `${environment.apiUrl}/CallLog/unread-missed`
    ).subscribe({
      next: (data) => {
        this.missedCallCount = data.count ?? data.missedCount ?? 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ──────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────
  ngOnInit() {
    this.userName = this.authService.getUserName() || 'User';
    this.userRole = this.authService.getUserRole();
    this.isSuperAdmin = this.userRole === 'SuperAdmin';
    this.isCustomer = this.userRole === 'Customer';
    this.isCompanyAdmin = this.userRole === 'CompanyAdmin';

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
    if (this.isCompanyAdmin) this.loadMailboxSetupStatus();
    this.loadNotifications();
    this.refreshHeaderCounts();

    this.loadSearchRecents();
    this.initSearchPipeline();

    this.updateActivePageFromUrl(this.router.url);
    this.router.events
      .pipe(
        filter((e: any) => e?.constructor?.name === 'NavigationEnd'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateActivePageFromUrl(this.router.url);
      });

    // Live counters (near real-time) without full page reload.
    interval(15000).pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshHeaderCounts());
  }

  private loadMailboxSetupStatus() {
    this.http.get<any>(`${environment.apiUrl}/Organizations/current`).subscribe({
      next: (org) => {
        const smtpPasswordSet = Boolean(org?.smtpPasswordSet);
        const complete = Boolean(
          org?.smtpHost &&
          org?.smtpPort &&
          org?.smtpFromEmail &&
          org?.smtpUsername &&
          smtpPasswordSet &&
          org?.imapHost &&
          org?.imapPort
        );
        this.smtpSetupIncomplete = !complete;
        this.smtpSetupChecked = true;
        // Propagate org-wide timezone to OrgContextService so date pipes,
        // calendars and any timezone-aware UI immediately use it.
        const tz = (org?.timezone || '').trim();
        if (tz) this.orgContext.setTimezone(tz);
        this.cdr.detectChanges();
      },
      error: () => {
        this.smtpSetupChecked = true;
        this.cdr.detectChanges();
      }
    });
  }

  goToMailboxOnboarding() {
    this.showProfileDropdown = false;
    this.router.navigate(['/onboarding']);
    this.cdr.detectChanges();
  }
  private updateActivePageFromUrl(url: string) {
    const clean = (url || '').split('?')[0] || '';
    const first = clean.split('/').filter(Boolean)[0] || 'dashboard';

    const map: any = {
      dashboard: { key: 'dashboard', title: 'Dashboard' },
      tickets: { key: 'tickets', title: 'Tickets' },
      contacts: { key: 'contacts', title: 'Contacts' },
      chat: { key: 'chat', title: 'Chat' },
      todo: { key: 'todo', title: 'To Do' },
      kb: { key: 'kb', title: 'Solutions' },
      agents: { key: 'agents', title: 'Team' },
      notifications: { key: 'notifications', title: 'Notifications' },
      calendar: { key: 'calendar', title: 'Calendar' },
      reports: { key: 'reports', title: 'Reports' },
      settings: { key: 'settings', title: 'Settings' }
    };

    const m = map[first] || { key: 'other', title: 'Dashboard' };
    this.activePageKey = m.key;
    this.activePageTitle = m.title;
    this.cdr.detectChanges();
  }

  get isTicketsSection(): boolean {
    return this.activePageKey === 'tickets';
  }

  get unresolvedMyCount(): number {
    return (this.myTicketCounts.open || 0) + (this.myTicketCounts.inProgress || 0) + (this.myTicketCounts.pending || 0);
  }


  ngAfterViewInit() {
    // Enable transitions after initial paint to avoid
    // "jump then settle" effect during navigation.
    setTimeout(() => {
      this.animationsReady = true;
      this.cdr.detectChanges();
    }, 0);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.disconnect();
  }

  // ──────────────────────────────────────────────
  // Profile
  // ──────────────────────────────────────────────
  private readonly COMPLETION_FIELDS = [
    'fullName', 'email', 'phoneNumber', 'department', 'location',
    'designation', 'dateOfBirth', 'dateOfJoining', 'gender', 'photoUrl'
  ];

  loadProfile() {
    this.http.get<any>(`${environment.apiUrl}/Profile`).subscribe({
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
        const filled = this.COMPLETION_FIELDS.filter(f => {
          const v = data[f];
          return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
        }).length;
        this.profileCompletion = Math.round((filled / this.COMPLETION_FIELDS.length) * 100);
        this.cdr.detectChanges();
      }
    });
  }

  // ──────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────
  loadNotifications() {
    this.http.get<any[]>(`${environment.apiUrl}/Notifications`).subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount   = data.filter(n => !n.isRead).length;
        this.cdr.detectChanges();
      }, error: () => {}
    });
  }

  loadUnreadCount() {
    this.http.get<any>(`${environment.apiUrl}/Notifications/unread-count`).subscribe({
      next: (data) => { this.unreadCount = data.count || 0; this.cdr.detectChanges(); },
      error: () => {}
    });
  }

  startNotifPolling() {
    // Replaced by refreshHeaderCounts polling.
  }

  toggleNotifDropdown() {
    this.showNotifDropdown = !this.showNotifDropdown;
    if (this.showNotifDropdown) this.loadNotifications();
    this.cdr.detectChanges();
  }

  markAllRead() {
    this.http.put(`${environment.apiUrl}/Notifications/mark-all-read`, {}).subscribe({
      next: () => {
        this.notifications.forEach(n => n.isRead = true);
        this.unreadCount = 0;
        this.cdr.detectChanges();
      }
    });
  }

  goToNotification(n: any) {
    this.showNotifDropdown = false;
    this.http.put(`${environment.apiUrl}/Notifications/${n.id}/read`, {}).subscribe({
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
  private initSearchPipeline() {
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((raw) => {
          const q = (raw || '').trim();
          if (q.length < 2) {
            this.searchLoading = false;
            this.searchData = null;
            this.flatSearchResults = [];
            this.cdr.detectChanges();
            return of(null);
          }

          this.searchLoading = true;
          this.cdr.detectChanges();
          const url = `${environment.apiUrl}/Search?q=${encodeURIComponent(q)}`;
          return this.http.get<any>(url).pipe(
            catchError(() => of(null))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((data) => {
        this.searchLoading = false;
        this.searchData = data;
        this.flatSearchResults = this.flattenSearchData(data);
        this.cdr.detectChanges();
      });
  }

  onSearchQueryChange() {
    if (!this.searchPanelOpen) this.openSearchPanel();
    this.search$.next(this.searchQuery);
  }

  openSearchPanel() {
    this.searchPanelOpen = true;
    setTimeout(() => {
      window.addEventListener('click', this.closeSearchPanel, { once: true });
      window.addEventListener('keydown', this.handleSearchEsc, { once: true });
    });
    this.cdr.detectChanges();
  }

  toggleSearchPanel(event?: MouseEvent) {
    if (event) event.stopPropagation();
    if (this.searchPanelOpen) {
      this.closeSearchPanel();
      return;
    }
    this.openSearchPanel();
    setTimeout(() => {
      try { this.globalSearchInput?.nativeElement?.focus(); } catch {}
    }, 0);
  }

  closeSearchPanel = () => {
    this.searchPanelOpen = false;
    this.searchLoading = false;
    this.cdr.detectChanges();
    window.removeEventListener('keydown', this.handleSearchEsc, { capture: true } as any);
  };

  handleSearchEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.closeSearchPanel();
  };

  setSearchTab(tab: 'all' | 'tickets' | 'contacts' | 'users' | 'solutions') {
    this.searchTab = tab;
    this.cdr.detectChanges();
  }

  get filteredSearchResults() {
    const q = (this.searchQuery || '').trim();
    if (!q) return [];

    if (this.searchTab === 'all') return this.flatSearchResults;
    if (this.searchTab === 'tickets') return this.flatSearchResults.filter(r => r.type === 'ticket');
    if (this.searchTab === 'contacts') return this.flatSearchResults.filter(r => r.type === 'contact');
    if (this.searchTab === 'users') return this.flatSearchResults.filter(r => r.type === 'user');
    return this.flatSearchResults.filter(r => r.type === 'article');
  }

  private flattenSearchData(data: any) {
    if (!data) return [];

    const tickets = (data.tickets || []).map((t: any) => ({
      type: 'ticket' as const,
      id: t.id,
      title: t.ticketNumber ? `${t.ticketNumber} ${t.title}` : t.title,
      subtitle: t.status,
      meta: undefined
    }));

    const contacts = (data.contacts || []).map((c: any) => ({
      type: 'contact' as const,
      id: c.id,
      title: c.name,
      subtitle: c.company ? `${c.company} • ${c.email}` : c.email
    }));

    const users = (data.users || []).map((u: any) => ({
      type: 'user' as const,
      id: u.id,
      title: u.name,
      subtitle: u.email,
      meta: u.role
    }));

    const articles = (data.articles || []).map((a: any) => ({
      type: 'article' as const,
      id: a.id,
      title: a.title,
      subtitle: a.category
    }));

    return [...tickets, ...contacts, ...users, ...articles].slice(0, 12);
  }

  applyRecentSearch(term: string) {
    this.searchQuery = term;
    this.onSearchQueryChange();
    this.cdr.detectChanges();
  }

  clearRecentSearches() {
    this.recentSearches = [];
    localStorage.removeItem('im3_recent_searches');
    this.cdr.detectChanges();
  }

  clearRecentViewed() {
    this.recentViewed = [];
    localStorage.removeItem('im3_recent_viewed');
    this.cdr.detectChanges();
  }

  private loadSearchRecents() {
    try {
      const rs = localStorage.getItem('im3_recent_searches');
      const rv = localStorage.getItem('im3_recent_viewed');
      this.recentSearches = rs ? JSON.parse(rs) : [];
      this.recentViewed = rv ? JSON.parse(rv) : [];
    } catch {
      this.recentSearches = [];
      this.recentViewed = [];
    }
  }

  private pushRecentSearch(term: string) {
    const t = (term || '').trim();
    if (!t) return;
    const next = [t, ...this.recentSearches.filter(x => x !== t)].slice(0, 6);
    this.recentSearches = next;
    localStorage.setItem('im3_recent_searches', JSON.stringify(next));
  }

  private pushRecentViewed(item: any) {
    if (!item?.id || !item?.type) return;
    const key = `${item.type}:${item.id}`;
    const next = [item, ...this.recentViewed.filter(x => `${x.type}:${x.id}` !== key)].slice(0, 6);
    this.recentViewed = next;
    localStorage.setItem('im3_recent_viewed', JSON.stringify(next));
  }

  goToGlobalResult(r: any) {
    const q = (this.searchQuery || '').trim();
    if (q) this.pushRecentSearch(q);
    this.pushRecentViewed(r);

    this.searchQuery = '';
    this.searchData = null;
    this.flatSearchResults = [];
    this.searchPanelOpen = false;
    this.cdr.detectChanges();

    if (r.type === 'ticket') {
      this.router.navigate(['/tickets', r.id]);
      return;
    }
    if (r.type === 'contact') {
      this.router.navigate(['/contacts'], { queryParams: { contactId: r.id } });
      return;
    }
    if (r.type === 'user') {
      this.router.navigate(['/agents'], { queryParams: { q: r.title } });
      return;
    }
    if (r.type === 'article') {
      this.router.navigate(['/kb', r.id]);
    }
  }

  goToRecentViewed(r: any) {
    this.searchQuery = '';
    this.searchPanelOpen = false;
    this.cdr.detectChanges();
    this.goToGlobalResult(r);
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