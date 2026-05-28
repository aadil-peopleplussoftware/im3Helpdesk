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
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { environment } from '../../../../environments/environment';
import { OrgContextService } from '../../../core/services/org-context.service';

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
  isBirthday?: boolean;
  isHoliday?: boolean;
  isFloatingHoliday?: boolean;
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
    RouterModule, LayoutComponent, HasPermissionDirective
  ],
  templateUrl: './calendar-event.html',
  styleUrls: ['./calendar-event.scss']
})
export class CalendarEventComponent implements OnInit, OnDestroy {

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private orgContext = inject(OrgContextService);
  private destroy$ = new Subject<void>();

  // ── View state ───────────────────────────────────
  currentView: 'month' | 'week' | 'day' | 'agenda' = 'month';
  currentDate = new Date();
  today = new Date();
  selectedDate: Date | null = null;

  // ── Data ─────────────────────────────────────────
  allEvents: CalendarEvent[] = [];
  allTickets: any[] = [];

  // Org-wide IANA timezone (was hardcoded to Asia/Kolkata). Reads the
  // current value from OrgContextService so a setting change in the UI
  // is reflected immediately on the next CD cycle.
  private get ticketTimeZone(): string { return this.orgContext.timezone(); }

  private ticketsRangeKey = '';

  private birthdaysRangeKey = '';
  private holidaysRangeKey = '';
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
    this.initIstCalendarClock();
    this.loadAll();
    // Poll reminders every 60s
    interval(60000).pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkReminders();
        this.ensureTicketsLoaded();
      });
  }

  private initIstCalendarClock() {
    // Create a stable Date that represents *today in IST* using UTC noon,
    // so it doesn't shift based on the user's machine timezone.
    const todayYmdIst = this.formatYmdInTimeZone(new Date(), this.ticketTimeZone);
    const parts = todayYmdIst.split('-').map(n => Number(n));
    if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
      const [y, m, d] = parts;
      const stable = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      this.today = stable;
      this.currentDate = new Date(stable);
      return;
    }

    // Fallback
    this.today = new Date();
    this.currentDate = new Date();
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
        this.ensureBirthdaysLoaded();
        this.ensureHolidaysLoaded();
        this.checkReminders();
        this.buildCalendar();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback: load from localStorage
        const saved = localStorage.getItem('im3_calendar_events');
        this.allEvents = saved ? JSON.parse(saved) : [];
        this.ensureBirthdaysLoaded();
        this.ensureHolidaysLoaded();
        this.checkReminders();
        this.buildCalendar();
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    this.ensureTicketsLoaded(true);
  }

  private ensureTicketsLoaded(force = false) {
    const { start, end } = this.getViewRange();
    const key = `${this.formatDateOnly(start)}|${this.formatDateOnly(end)}`;
    if (!force && key === this.ticketsRangeKey) return;
    this.ticketsRangeKey = key;

    const qs = new URLSearchParams({
      start: this.formatDateOnly(start),
      end: this.formatDateOnly(end)
    });

    this.http.get<any[]>(
      `${environment.apiUrl}/Tickets/calendar?${qs.toString()}`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (tickets) => {
        this.allTickets = tickets || [];
        this.buildCalendar();
        this.cdr.detectChanges();
      },
      error: () => {
        // Allow retry on next tick.
        this.ticketsRangeKey = '';
      }
    });
  }

  // ─────────────────────────────────────────────────
  // Calendar building
  // ─────────────────────────────────────────────────
  buildCalendar() {
    this.ensureBirthdaysLoaded();
    this.ensureHolidaysLoaded();
    this.ensureTicketsLoaded();
    if (this.currentView === 'month') this.buildMonthView();
    else if (this.currentView === 'week') this.buildWeekView();
    else if (this.currentView === 'day') this.buildDayView();
    else this.buildAgendaView();
  }

  private formatDateOnly(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private getViewRange(): { start: Date; end: Date } {
    if (this.currentView === 'month') {
      const year = this.currentDate.getUTCFullYear();
      const month = this.currentDate.getUTCMonth();
      const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
      const start = new Date(firstDay);
      start.setUTCDate(start.getUTCDate() - firstDay.getUTCDay());
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 41);
      return { start, end };
    }

    if (this.currentView === 'week') {
      const start = new Date(this.currentDate);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start, end };
    }

    if (this.currentView === 'day') {
      const start = new Date(this.currentDate);
      const end = new Date(this.currentDate);
      return { start, end };
    }

    // agenda
    const start = new Date(this.today);
    const end = new Date(this.today);
    end.setUTCDate(end.getUTCDate() + 29);
    return { start, end };
  }

  private ensureBirthdaysLoaded() {
    const { start, end } = this.getViewRange();
    const key = `${this.formatDateOnly(start)}|${this.formatDateOnly(end)}`;
    if (key === this.birthdaysRangeKey) return;
    this.birthdaysRangeKey = key;

    const qs = new URLSearchParams({
      start: this.formatDateOnly(start),
      end: this.formatDateOnly(end)
    });

    this.http.get<CalendarEvent[]>(
      `${environment.apiUrl}/Birthdays/calendar?${qs.toString()}`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (items) => {
        const birthdays = (items || []).map(e => ({
          ...e,
          isBirthday: true,
          allDay: true,
          type: 'event',
          priority: 'low',
          isCompleted: false
        } as CalendarEvent));

        // Replace existing birthday events for this view.
        this.allEvents = this.allEvents.filter(e => !e.isBirthday).concat(birthdays);
        this.checkReminders();
        this.buildCalendar();
        this.cdr.detectChanges();
      },
      error: () => {
        // Retry later (important if API was restarted).
        if (this.birthdaysRangeKey === key) this.birthdaysRangeKey = '';
      }
    });
  }

  /** Loads org holidays in the current view range as read-only events. */
  private ensureHolidaysLoaded() {
    const { start, end } = this.getViewRange();
    const key = `${this.formatDateOnly(start)}|${this.formatDateOnly(end)}`;
    if (key === this.holidaysRangeKey) return;
    this.holidaysRangeKey = key;

    const qs = new URLSearchParams({
      start: this.formatDateOnly(start),
      end: this.formatDateOnly(end)
    });

    this.http.get<any[]>(
      `${environment.apiUrl}/Holidays/calendar?${qs.toString()}`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (items) => {
        const holidays = (items || []).map(e => ({
          ...e,
          isHoliday: true,
          isFloatingHoliday: !!e.isFloatingHoliday,
          allDay: true,
          type: 'event',
          priority: 'low',
          isCompleted: false
        } as CalendarEvent));

        // Replace existing holiday events.
        this.allEvents = this.allEvents.filter(e => !e.isHoliday).concat(holidays);
        this.buildCalendar();
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.holidaysRangeKey === key) this.holidaysRangeKey = '';
      }
    });
  }

  buildMonthView() {
    const year = this.currentDate.getUTCFullYear();
    const month = this.currentDate.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    const lastDay = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));
    const startDate = new Date(firstDay);
    startDate.setUTCDate(startDate.getUTCDate() - firstDay.getUTCDay());

    this.calendarDays = [];
    const d = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      this.calendarDays.push({
        date: new Date(d),
        isCurrentMonth: d.getUTCMonth() === month,
        isToday: this.isSameDay(d, this.today),
        events: this.getEventsForDay(d),
        tickets: this.getTicketsForDay(d)
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  buildWeekView() {
    const start = new Date(this.currentDate);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
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
      d.setUTCDate(d.getUTCDate() + i);
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
      return this.isSameDayInTimeZone(new Date(e.startDate), date, this.ticketTimeZone);
    });
  }

  getTicketsForDay(date: Date): any[] {
    const occurrences: any[] = [];

    for (const ticket of this.allTickets) {
      const createdAtRaw = ticket?.createdAt ?? ticket?.CreatedAt;
      if (!createdAtRaw) continue;

      const createdAt = new Date(createdAtRaw);

      const updatedAtRaw = ticket?.updatedAt ?? ticket?.UpdatedAt;
      const lastActivityAtRaw = ticket?.lastActivityAt ?? ticket?.LastActivityAt;

      const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : null;
      const lastActivityAt = lastActivityAtRaw ? new Date(lastActivityAtRaw) : null;
      const activityAt = updatedAt && lastActivityAt
        ? (updatedAt > lastActivityAt ? updatedAt : lastActivityAt)
        : (updatedAt || lastActivityAt);

      // Always show on created day.
      if (this.isSameDayInTimeZone(createdAt, date, this.ticketTimeZone)) {
        occurrences.push({ ...ticket, __calendarOccurrence: 'created' });
        continue;
      }

      // Also show on the day it was last updated (status change / comment / assignment etc).
      if (activityAt && this.isSameDayInTimeZone(activityAt, date, this.ticketTimeZone)) {
        occurrences.push({ ...ticket, __calendarOccurrence: 'updated', __calendarActivityAt: activityAt.toISOString() });
      }
    }

    return occurrences;
  }

  getTicketStatusLabel(ticket: any): string {
    if (ticket?.__calendarOccurrence === 'created') return 'Created';
    return ticket?.status ?? '';
  }

  getTicketStatusDisplayColor(ticket: any): string {
    if (ticket?.__calendarOccurrence === 'created') return this.getStatusColor('Open');
    return this.getStatusColor(ticket?.status);
  }

  getTicketMetaTimeLabel(ticket: any): string {
    return ticket?.__calendarOccurrence === 'updated' ? 'Updated' : 'Created';
  }

  getTicketMetaTimeValue(ticket: any): string {
    return (ticket?.__calendarOccurrence === 'updated' && ticket?.__calendarActivityAt)
      ? ticket.__calendarActivityAt
      : ticket?.createdAt;
  }

  private formatYmdInTimeZone(date: Date, timeZone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    } catch {
      return this.formatDateOnly(date);
    }
  }

  private formatCellYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private isSameDayInTimeZone(a: Date, b: Date, timeZone: string): boolean {
    // Compare instants' IST date against the calendar cell's stable date-only
    // (UTC components represent the IST date).
    return this.formatYmdInTimeZone(a, timeZone) === this.formatDateOnly(b);
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
    if (this.currentView === 'month') d.setUTCMonth(d.getUTCMonth() - 1);
    else if (this.currentView === 'week') d.setUTCDate(d.getUTCDate() - 7);
    else d.setUTCDate(d.getUTCDate() - 1);
    this.currentDate = d;
    this.buildCalendar();
  }

  nextPeriod() {
    const d = new Date(this.currentDate);
    if (this.currentView === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (this.currentView === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCDate(d.getUTCDate() + 1);
    this.currentDate = d;
    this.buildCalendar();
  }

  goToToday() {
    this.currentDate = new Date(this.today);
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
    if (event.isBirthday) {
      this.toastr.info('Birthday events are read-only');
      return;
    }
    if (event.isHoliday) {
      this.toastr.info('Holiday events are read-only. Edit them from Holiday Setup.');
      return;
    }
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
    if (event.isBirthday) return;
    if (event.isHoliday) return;
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
    if (event.isBirthday) return;
    if (event.isHoliday) return;
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
    const persistable = this.allEvents.filter(e => !e.isBirthday && !e.isHoliday);
    localStorage.setItem('im3_calendar_events', JSON.stringify(persistable));
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
      return a.getUTCFullYear() === b.getUTCFullYear() &&
        a.getUTCMonth() === b.getUTCMonth() &&
        a.getUTCDate() === b.getUTCDate();
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: this.ticketTimeZone });
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: this.ticketTimeZone });
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
    if (ev.isBirthday) return;
    if (ev.isHoliday) return;
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