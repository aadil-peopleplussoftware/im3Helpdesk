import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BusinessHoursListItem {
  id: string;
  name: string;
  isDefault: boolean;
  timezone: string;
  groupsCount: number;
}

export interface BusinessHoursHoliday {
  id: string;
  name: string;
  /** "yyyy-MM-dd" */
  date: string;
  isRecurring: boolean;
}

export interface BusinessHoursGroup {
  id: string;
  name: string;
  assigned: boolean;
}

export interface BusinessHoursDetail {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  /** "TwentyFourSeven" | "Custom" */
  mode: string;
  timezone: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startTime: string;
  endTime: string;
  holidays: BusinessHoursHoliday[];
  groups: BusinessHoursGroup[];
}

export interface BusinessHoursUpsert {
  name: string;
  description?: string;
  mode: string;
  timezone: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startTime: string;
  endTime: string;
}

export interface BusinessHoursHolidayUpsert {
  name: string;
  date: string;
  isRecurring: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusinessHoursService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/business-hours`;

  list(): Observable<BusinessHoursListItem[]> {
    return this.http.get<BusinessHoursListItem[]>(this.base);
  }

  get(id: string): Observable<BusinessHoursDetail> {
    return this.http.get<BusinessHoursDetail>(`${this.base}/${id}`);
  }

  create(body: BusinessHoursUpsert): Observable<BusinessHoursDetail> {
    return this.http.post<BusinessHoursDetail>(this.base, body);
  }

  update(id: string, body: BusinessHoursUpsert): Observable<BusinessHoursDetail> {
    return this.http.put<BusinessHoursDetail>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addHoliday(id: string, body: BusinessHoursHolidayUpsert): Observable<BusinessHoursHoliday> {
    return this.http.post<BusinessHoursHoliday>(`${this.base}/${id}/holidays`, body);
  }

  updateHoliday(id: string, holidayId: string, body: BusinessHoursHolidayUpsert): Observable<BusinessHoursHoliday> {
    return this.http.put<BusinessHoursHoliday>(`${this.base}/${id}/holidays/${holidayId}`, body);
  }

  deleteHoliday(id: string, holidayId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/holidays/${holidayId}`);
  }

  assignGroups(id: string, groupIds: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/groups`, { groupIds });
  }

  /** Common IANA timezone choices used across the app. */
  static readonly timezones: { value: string; label: string }[] = [
    { value: 'UTC', label: '(GMT+00:00) UTC' },
    { value: 'America/New_York',     label: '(GMT-05:00) Eastern Time (US & Canada)' },
    { value: 'America/Chicago',      label: '(GMT-06:00) Central Time (US & Canada)' },
    { value: 'America/Denver',       label: '(GMT-07:00) Mountain Time (US & Canada)' },
    { value: 'America/Los_Angeles',  label: '(GMT-08:00) Pacific Time (US & Canada)' },
    { value: 'Europe/London',        label: '(GMT+00:00) London' },
    { value: 'Europe/Berlin',        label: '(GMT+01:00) Berlin' },
    { value: 'Europe/Paris',         label: '(GMT+01:00) Paris' },
    { value: 'Asia/Kolkata',         label: '(GMT+05:30) Mumbai, Kolkata, New Delhi' },
    { value: 'Asia/Singapore',       label: '(GMT+08:00) Singapore' },
    { value: 'Asia/Tokyo',           label: '(GMT+09:00) Tokyo' },
    { value: 'Australia/Sydney',     label: '(GMT+10:00) Sydney' },
  ];
}
