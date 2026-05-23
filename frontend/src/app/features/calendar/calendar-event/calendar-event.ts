import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

// ── Interfaces ──────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;      // ISO string
  endDate?: string;
  allDay: boolean;
  type: 'reminder' | 'event' | 'ticket' | 'meeting' | 'deadline';
  priority: 'low' | 'medium' | 'high';
  ticketId?: string;
  ticketNumber?: number;
  isCompleted: boolean;
  reminderMinutes?: number;  // 0=no reminder, 15,30,60,1440 etc
  color?: string;
  attendeeEmails?: string;   // comma-separated: "a@b.com,c@d.com"
  reminderSent?: boolean;
  createdAt: string;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  tickets: any[];
}

// ── Component ────────────────────────────────────────
@Component({
  selector: 'app-calendar-event',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [
    CommonModule, FormsModule,
    RouterModule, LayoutComponent
  ],
  templateUrl: './calendar-event.html',
  styleUrls: ['./calendar-event.scss']
})
export class CalendarEventComponent implements OnInit, OnDestroy {

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  // ── View state ───────────────────────────────────
  currentView: 'month' | 'week' | 'day' | 'agenda' = 'month';
  currentDate = new Date();
  today = new Date();
  selectedDate: Date | null = null;

  // ── Data ─────────────────────────────────────────
  allEvents: CalendarEvent[] = [];
  allTickets: any[] = [];
  calendarDays: DayCell[] = [];
  weekDays: DayCell[] = [];
  agendaItems: { date: Date; events: CalendarEvent[]; tickets: any[] }[] = [];

  // ── UI state ──────────────────────────────────────
  loading = false;
  showEventModal = false;
  showDetailModal = false;
  selectedEvent: CalendarEvent | null = null;
  selectedDayEvents: { events: CalendarEvent[]; tickets: any[] } | null = null;
  showMiniCal = false;

  // ── Filters ───────────────────────────────────────
  filterType: string = 'all';
  showCompleted = false;

  // ── Upcoming reminders ────────────────────────────
  upcomingReminders: CalendarEvent[] = [];
  overdueItems: CalendarEvent[] = [];
  missedReminders: CalendarEvent[] = [];

  // ── New event form ────────────────────────────────
  newEvent: Partial<CalendarEvent> = {};
  isEditMode = false;
  attendeeInput = '';          // current input field value
  sendingReminder = false;     // loading state for send-reminder btn

  readonly eventTypes = [
    { value: 'reminder', label: 'Reminder', icon: '🔔' },
    { value: 'event', label: 'Event', icon: '📅' },
    { value: 'meeting', label: 'Meeting', icon: '👥' },
    { value: 'deadline', label: 'Deadline', icon: '⏰' },
    { value: 'ticket', label: 'Ticket', icon: '🎫' }
  ];

  readonly reminderOptions = [
    { value: 0, label: 'No reminder' },
    { value: 5, label: '5 minutes before' },
    { value: 15, label: '15 minutes before' },
    { value: 30, label: '30 minutes before' },
    { value: 60, label: '1 hour before' },
    { value: 120, label: '2 hours before' },
    { value: 1440, label: '1 day before' },
    { value: 2880, label: '2 days before' }
  ];

  readonly priorityColors: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444'
  };

  readonly typeColors: Record<string, string> = {
    reminder: '#8b5cf6',
    event: '#3b82f6',
    meeting: '#06b6d4',
    deadline: '#ef4444',
    ticket: '#f59e0b'
  };

  readonly monthNames = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];
  readonly dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ─────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────
  ngOnInit() {
    this.loadAll();
    // Poll reminders every 60s
    interval(60000).pipe(takeUntil(this.destroy$))
      .subscribe(() => this.checkReminders());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────
  loadAll() {
    this.loading = true;

    // Load events from backend
    this.http.get<CalendarEvent[]>(
      `${environment.apiUrl}/CalendarEvents`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (events) => {
        this.allEvents = events || [];
        this.checkReminders();
        this.buildCalendar();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback: load from localStorage
        const saved = localStorage.getItem('im3_calendar_events');
        this.allEvents = saved ? JSON.parse(saved) : [];
        this.checkReminders();
        this.buildCalendar();
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    // Load tickets for calendar
    this.http.get<any[]>(
      `${environment.apiUrl}/Tickets`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (tickets) => {
        this.allTickets = tickets || [];
        this.buildCalendar();
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // ─────────────────────────────────────────────────
  // Calendar building
  // ─────────────────────────────────────────────────
  buildCalendar() {
    if (this.currentView === 'month') this.buildMonthView();
    else if (this.currentView === 'week') this.buildWeekView();
    else if (this.currentView === 'day') this.buildDayView();
    else this.buildAgendaView();
  }

  buildMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    this.calendarDays = [];
    const d = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      this.calendarDays.push({
        date: new Date(d),
        isCurrentMonth: d.getMonth() === month,
        isToday: this.isSameDay(d, this.today),
        events: this.getEventsForDay(d),
        tickets: this.getTicketsForDay(d)
      });
      d.setDate(d.getDate() + 1);
    }
  }

  buildWeekView() {
    const start = new Date(this.currentDate);
    start.setDate(start.getDate() - start.getDay());
    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      this.weekDays.push({
        date: d,
        isCurrentMonth: true,
        isToday: this.isSameDay(d, this.today),
        events: this.getEventsForDay(d),
        tickets: this.getTicketsForDay(d)
      });
    }
  }

  buildDayView() {
    // Day view uses currentDate directly
  }

  buildAgendaView() {
    this.agendaItems = [];
    const start = new Date(this.today);
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const events = this.getEventsForDay(d);
      const tickets = this.getTicketsForDay(d);
      if (events.length > 0 || tickets.length > 0) {
        this.agendaItems.push({ date: d, events, tickets });
      }
    }
  }

  // ─────────────────────────────────────────────────
  // Event helpers
  // ─────────────────────────────────────────────────
  getEventsForDay(date: Date): CalendarEvent[] {
    return this.allEvents.filter(e => {
      if (!this.showCompleted && e.isCompleted) return false;
      if (this.filterType !== 'all' && e.type !== this.filterType) return false;
      return this.isSameDay(new Date(e.startDate), date);
    });
  }

  getTicketsForDay(date: Date): any[] {
    return this.allTickets.filter(t =>
      t.createdAt && this.isSameDay(new Date(t.createdAt), date)
    );
  }

  getEventsForCurrentDay(): CalendarEvent[] {
    return this.getEventsForDay(this.currentDate);
  }

  getTicketsForCurrentDay(): any[] {
    return this.getTicketsForDay(this.currentDate);
  }

  getHourEvents(hour: number): CalendarEvent[] {
    return this.getEventsForDay(this.currentDate).filter(e => {
      const h = new Date(e.startDate).getHours();
      return h === hour;
    });
  }

  checkReminders() {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 60 * 1000);

    this.upcomingReminders = this.allEvents.filter(e => {
      if (e.isCompleted || !e.reminderMinutes) return false;
      const eventTime = new Date(e.startDate);
      const reminderTime = new Date(eventTime.getTime() - (e.reminderMinutes || 0) * 60 * 1000);
      return reminderTime > now && reminderTime <= in30;
    });

    this.overdueItems = this.allEvents.filter(e => {
      if (e.isCompleted) return false;
      return new Date(e.startDate) < now;
    });

    this.missedReminders = this.allEvents.filter(e => {
      if (e.isCompleted) return false;
      const eventTime = new Date(e.startDate);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return eventTime >= yesterday && eventTime < now;
    });
  }

  // ─────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────
  prevPeriod() {
    const d = new Date(this.currentDate);
    if (this.currentView === 'month') d.setMonth(d.getMonth() - 1);
    else if (this.currentView === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    this.currentDate = d;
    this.buildCalendar();
  }

  nextPeriod() {
    const d = new Date(this.currentDate);
    if (this.currentView === 'month') d.setMonth(d.getMonth() + 1);
    else if (this.currentView === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    this.currentDate = d;
    this.buildCalendar();
  }

  goToToday() {
    this.currentDate = new Date();
    this.buildCalendar();
  }

  setView(view: 'month' | 'week' | 'day' | 'agenda') {
    this.currentView = view;
    this.buildCalendar();
    this.cdr.detectChanges();
  }

  // ─────────────────────────────────────────────────
  // Day click
  // ─────────────────────────────────────────────────
  onDayClick(day: DayCell) {
    this.selectedDate = day.date;
    if (day.events.length > 0 || day.tickets.length > 0) {
      this.selectedDayEvents = { events: day.events, tickets: day.tickets };
      this.showDetailModal = true;
    } else {
      this.openNewEventModal(day.date);
    }
    this.cdr.detectChanges();
  }

  // ─────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────
  openNewEventModal(date?: Date) {
    const d = date || this.currentDate;
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0)
      .toISOString().slice(0, 16);
    this.newEvent = {
      title: '',
      description: '',
      startDate: iso,
      allDay: false,
      type: 'event',
      priority: 'medium',
      isCompleted: false,
      reminderMinutes: 30,
      attendeeEmails: ''
    };
    this.isEditMode = false;
    this.showEventModal = true;
    this.showDetailModal = false;
    this.cdr.detectChanges();
  }

  editEvent(event: CalendarEvent) {
    this.newEvent = {
      ...event,
      startDate: new Date(event.startDate).toISOString().slice(0, 16),
      endDate: event.endDate
        ? new Date(event.endDate).toISOString().slice(0, 16)
        : undefined
    };
    this.isEditMode = true;
    this.showEventModal = true;
    this.showDetailModal = false;
    this.cdr.detectChanges();
  }

  async saveEvent() {
    if (!this.newEvent.title?.trim()) {
      this.toastr.warning('Title is required');
      return;
    }

    const payload = { ...this.newEvent };

    if (this.isEditMode && payload.id) {
      this.http.put<CalendarEvent>(
        `${environment.apiUrl}/CalendarEvents/${payload.id}`,
        payload
      ).subscribe({
        next: (updated) => {
          const idx = this.allEvents.findIndex(e => e.id === updated.id);
          if (idx > -1) this.allEvents[idx] = updated;
          this.saveLocal();
          this.buildCalendar();
          this.showEventModal = false;
          this.toastr.success('Event updated!');
          this.cdr.detectChanges();
        },
        error: () => {
          // Local fallback
          const idx = this.allEvents.findIndex(e => e.id === payload.id);
          if (idx > -1) this.allEvents[idx] = payload as CalendarEvent;
          this.saveLocal();
          this.buildCalendar();
          this.showEventModal = false;
          this.toastr.success('Event updated (local)');
          this.cdr.detectChanges();
        }
      });
    } else {
      const newEv: CalendarEvent = {
        ...payload,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      } as CalendarEvent;

      this.http.post<CalendarEvent>(
        `${environment.apiUrl}/CalendarEvents`, newEv
      ).subscribe({
        next: (created) => {
          this.allEvents.push(created);
          this.saveLocal();
          this.buildCalendar();
          this.showEventModal = false;
          this.toastr.success('Event created!');
          this.cdr.detectChanges();
        },
        error: () => {
          this.allEvents.push(newEv);
          this.saveLocal();
          this.buildCalendar();
          this.showEventModal = false;
          this.toastr.success('Event saved locally!');
          this.cdr.detectChanges();
        }
      });
    }
  }

  deleteEvent(event: CalendarEvent) {
    if (!confirm(`Delete "${event.title}"?`)) return;
    this.http.delete(
      `${environment.apiUrl}/CalendarEvents/${event.id}`
    ).subscribe({
      next: () => this.removeEventLocally(event.id),
      error: () => this.removeEventLocally(event.id)
    });
  }

  private removeEventLocally(id: string) {
    this.allEvents = this.allEvents.filter(e => e.id !== id);
    this.saveLocal();
    this.buildCalendar();
    this.showDetailModal = false;
    this.showEventModal = false;
    this.toastr.success('Event deleted');
    this.cdr.detectChanges();
  }

  toggleComplete(event: CalendarEvent) {
    event.isCompleted = !event.isCompleted;
    this.http.put(
      `${environment.apiUrl}/CalendarEvents/${event.id}`, event
    ).subscribe({
      next: () => {},
      error: () => {}
    });
    this.saveLocal();
    this.buildCalendar();
    this.cdr.detectChanges();
  }

  private saveLocal() {
    localStorage.setItem('im3_calendar_events', JSON.stringify(this.allEvents));
  }

  // ─────────────────────────────────────────────────
  // Display helpers
  // ─────────────────────────────────────────────────
  getHeaderTitle(): string {
    const y = this.currentDate.getFullYear();
    const m = this.monthNames[this.currentDate.getMonth()];
    if (this.currentView === 'month') return `${m} ${y}`;
    if (this.currentView === 'week') {
      const start = new Date(this.currentDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getDate()} ${this.monthNames[start.getMonth()]} – ${end.getDate()} ${this.monthNames[end.getMonth()]} ${y}`;
    }
    if (this.currentView === 'day') {
      return `${this.dayNames[this.currentDate.getDay()]}, ${this.currentDate.getDate()} ${m} ${y}`;
    }
    return `Next 30 Days`;
  }

  getEventColor(event: CalendarEvent): string {
    return event.color || this.typeColors[event.type] || '#3b82f6';
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      reminder: '🔔', event: '📅', meeting: '👥',
      deadline: '⏰', ticket: '🎫'
    };
    return icons[type] || '📅';
  }

  getPriorityLabel(p: string): string {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  getStatusColor(status: string): string {
    const c: Record<string, string> = {
      'Open': '#22c55e', 'InProgress': '#f59e0b',
      'Pending': '#3b82f6', 'Resolved': '#8b5cf6', 'Closed': '#6b7280'
    };
    return c[status] || '#6b7280';
  }

  isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  getTimeUntil(dateStr: string): string {
    if (!dateStr) return '';
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff < 0) return 'overdue';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.floor(hrs / 24)}d`;
  }

  get hours(): number[] {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  formatHour(h: number): string {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  navigateToTicket(ticketId: string) {
    this.router.navigate(['/tickets', ticketId]);
  }

  // ── Attendee helpers ──────────────────────────────
  getAttendeesArray(): string[] {
    if (!this.newEvent.attendeeEmails?.trim()) return [];
    return this.newEvent.attendeeEmails
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));
  }

  addAttendee() {
    const email = this.attendeeInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const existing = this.getAttendeesArray();
    if (existing.includes(email)) {
      this.attendeeInput = '';
      return;
    }
    const updated = [...existing, email].join(',');
    this.newEvent = { ...this.newEvent, attendeeEmails: updated };
    this.attendeeInput = '';
    this.cdr.detectChanges();
  }

  removeAttendee(email: string) {
    const updated = this.getAttendeesArray()
      .filter(e => e !== email)
      .join(',');
    this.newEvent = { ...this.newEvent, attendeeEmails: updated };
    this.cdr.detectChanges();
  }

  onAttendeeKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addAttendee();
    }
  }

  // ── Send reminder manually ─────────────────────────
  async sendReminderNow(ev: CalendarEvent) {
    if (this.sendingReminder) return;
    this.sendingReminder = true;
    this.cdr.detectChanges();

    this.http.post(
      `${environment.apiUrl}/CalendarEvents/${ev.id}/send-reminder`,
      {}
    ).subscribe({
      next: (res: any) => {
        this.sendingReminder = false;
        this.toastr.success(
          `Reminder sent to ${res.sentTo} people!`);
        // Update local event
        const idx = this.allEvents.findIndex(e => e.id === ev.id);
        if (idx > -1) this.allEvents[idx].reminderSent = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.sendingReminder = false;
        this.toastr.error('Failed to send reminder');
        this.cdr.detectChanges();
      }
    });
  }

  getAttendeesFromEvent(ev: CalendarEvent): string[] {
    if (!ev.attendeeEmails?.trim()) return [];
    return ev.attendeeEmails.split(',').map(e => e.trim()).filter(e => e);
  }

  // Called from modal delete button — works with Partial<CalendarEvent>
  deleteEventFromModal() {
    if (!this.newEvent.id) return;
    const ev = this.allEvents.find(e => e.id === this.newEvent.id);
    if (ev) this.deleteEvent(ev);
  }

  // Called from modal "Send Reminder" button — avoids 'as any' cast
  sendReminderFromModal() {
    if (!this.newEvent.id) return;
    const ev = this.allEvents.find(e => e.id === this.newEvent.id);
    if (ev) this.sendReminderNow(ev);
  }

  closeModals() {
    this.showEventModal = false;
    this.showDetailModal = false;
    this.cdr.detectChanges();
  }

  get filteredAgendaCount(): number {
    return this.agendaItems.reduce((sum, i) =>
      sum + i.events.length + i.tickets.length, 0);
  }

  get totalEventsToday(): number {
    return this.getEventsForDay(this.today).length +
           this.getTicketsForDay(this.today).length;
  }

  getReminderLabel(minutes?: number): string {
    if (!minutes) return '';
    const labels: Record<number, string> = {
      5: '5 min before', 15: '15 min before',
      30: '30 min before', 60: '1 hr before',
      120: '2 hrs before', 1440: '1 day before',
      2880: '2 days before'
    };
    return labels[minutes] ?? `${minutes} min before`;
  }
}