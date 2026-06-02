import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** TicketPriority enum mirror (Domain/Enums/TicketPriority.cs). */
export type TicketPriorityValue = 0 | 1 | 2 | 3; // Low | Medium | High | Critical(Urgent)

export interface SlaPolicyListItem {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  order: number;
}

export interface SlaTarget {
  id?: string;
  priority: TicketPriorityValue;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  operationalHours: 'BusinessHours' | 'CalendarHours';
  escalationEnabled: boolean;
}

export interface SlaReminder {
  id?: string;
  targetType: 'FirstResponse' | 'Resolution';
  approachInMinutes: number;
  /** CSV: "AssignedAgent","Group","ReportingManager","User:{guid}" */
  recipients: string;
}

export interface SlaEscalation {
  id?: string;
  targetType: 'FirstResponse' | 'Resolution';
  /** 0 = Immediately, else minutes after breach */
  escalateAfterMinutes: number;
  recipients: string;
}

export interface SlaPolicyDetail extends SlaPolicyListItem {
  targets: SlaTarget[];
  reminders: SlaReminder[];
  escalations: SlaEscalation[];
}

export interface SlaPolicyUpsert {
  name: string;
  description?: string | null;
  isActive: boolean;
  targets: SlaTarget[];
  reminders: SlaReminder[];
  escalations: SlaEscalation[];
}

export interface BusinessHours {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startTime: string; // "HH:mm"
  endTime: string;
  timezone: string;
}

@Injectable({ providedIn: 'root' })
export class SlaPoliciesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/sla-policies`;

  list(): Observable<SlaPolicyListItem[]> {
    return this.http.get<SlaPolicyListItem[]>(this.base);
  }

  get(id: string): Observable<SlaPolicyDetail> {
    return this.http.get<SlaPolicyDetail>(`${this.base}/${id}`);
  }

  create(body: SlaPolicyUpsert): Observable<SlaPolicyDetail> {
    return this.http.post<SlaPolicyDetail>(this.base, body);
  }

  update(id: string, body: SlaPolicyUpsert): Observable<SlaPolicyDetail> {
    return this.http.put<SlaPolicyDetail>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  toggle(id: string, isActive: boolean): Observable<{ id: string; isActive: boolean }> {
    return this.http.post<{ id: string; isActive: boolean }>(
      `${this.base}/${id}/toggle`, { isActive });
  }

  getBusinessHours(): Observable<BusinessHours> {
    return this.http.get<BusinessHours>(`${this.base}/business-hours`);
  }

  updateBusinessHours(body: BusinessHours): Observable<BusinessHours> {
    return this.http.put<BusinessHours>(`${this.base}/business-hours`, body);
  }

  // ── helpers ─────────────────────────────────────────────────

  /** "30m" / "4h" / "1h 30m" / "90" → minutes. Bare numbers = minutes. */
  static parseDuration(text: string): number {
    if (!text) return 0;
    const s = String(text).trim().toLowerCase();
    if (/^\d+$/.test(s)) return Number(s);
    let total = 0;
    const re = /(\d+)\s*([dhm])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const n = Number(m[1]);
      total += m[2] === 'd' ? n * 24 * 60 : m[2] === 'h' ? n * 60 : n;
    }
    return total;
  }

  /** 30 → "30m", 240 → "4h", 1500 → "1d 1h" */
  static formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '0m';
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.join(' ');
  }

  /** Display label for priority — Critical shown as "Urgent" (Freshdesk style). */
  static priorityLabel(p: TicketPriorityValue): string {
    return p === 3 ? 'Urgent' : p === 2 ? 'High' : p === 1 ? 'Medium' : 'Low';
  }

  static priorityColor(p: TicketPriorityValue): string {
    return p === 3 ? '#dc2626' : p === 2 ? '#ea580c' : p === 1 ? '#2563eb' : '#16a34a';
  }
}
