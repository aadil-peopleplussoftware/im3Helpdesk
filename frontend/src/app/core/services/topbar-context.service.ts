import { Injectable, signal } from '@angular/core';

/**
 * Cross-feature topbar context channel.
 *
 * Feature pages (e.g. ticket-detail) push a contextual label like
 * `"#TN1007"` while open; the main layout reads it and appends a
 * breadcrumb (`Tickets › #TN1007`) to the topbar title. Pages must
 * clear the value on destroy so other routes don't inherit it.
 */
@Injectable({ providedIn: 'root' })
export class TopbarContextService {
  /** Current contextual suffix, e.g. "#TN1007". Empty string when none. */
  readonly suffix = signal<string>('');

  set(value: string | null | undefined) {
    this.suffix.set((value || '').trim());
  }
  clear() {
    this.suffix.set('');
  }
}
