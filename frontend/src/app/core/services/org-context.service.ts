import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Holds the current organization's project-wide preferences that must be
 * available to any UI component (date pipes, calendars, schedulers, etc.).
 *
 * Today it tracks the org's IANA timezone (e.g. `"Asia/Kolkata"`). The
 * value is loaded once after login and persisted to localStorage so first
 * paint (before the HTTP call returns) already uses the right zone.
 */
@Injectable({ providedIn: 'root' })
export class OrgContextService {
  private static readonly STORAGE_KEY = 'im3_org_timezone';
  private static readonly DEFAULT_TZ = 'Asia/Kolkata';

  readonly timezone = signal<string>(this.readCachedTimezone());

  constructor(private http: HttpClient) {}

  /** One-shot loader; safe to call from app bootstrap / main layout. */
  load(): void {
    this.http
      .get<{ timezone?: string }>(`${environment.apiUrl}/Organizations/current`)
      .subscribe({
        next: (org) => {
          const tz = (org?.timezone || '').trim();
          if (tz) this.setTimezone(tz);
        },
        error: () => {
          /* keep cached / default */
        },
      });
  }

  /** Update locally and persist; call after the user saves a new timezone. */
  setTimezone(tz: string): void {
    const clean = (tz || '').trim() || OrgContextService.DEFAULT_TZ;
    this.timezone.set(clean);
    try {
      localStorage.setItem(OrgContextService.STORAGE_KEY, clean);
    } catch {
      /* ignore storage errors */
    }
  }

  private readCachedTimezone(): string {
    try {
      return (
        localStorage.getItem(OrgContextService.STORAGE_KEY) ||
        OrgContextService.DEFAULT_TZ
      );
    } catch {
      return OrgContextService.DEFAULT_TZ;
    }
  }
}
