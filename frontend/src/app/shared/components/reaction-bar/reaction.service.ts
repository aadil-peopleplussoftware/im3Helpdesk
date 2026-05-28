import { Injectable } from '@angular/core';

export type ReactionKey =
  | 'like' | 'heart' | 'laugh' | 'wow' | 'sad' | 'dislike';

/**
 * Reactions persistence. Currently localStorage-backed (per browser user).
 *
 * Storage shape:
 *   im3.reactions.v1 = {
 *     [targetId]: { [userId]: ReactionKey }
 *   }
 *
 * Swap to backend by replacing the read/write helpers with HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class ReactionService {
  private readonly KEY = 'im3.reactions.v1';

  private getUserId(): string {
    // Stable per-browser identity; falls back to a generated guest id.
    const name = localStorage.getItem('im3_name') || '';
    if (name) return name;
    let guest = localStorage.getItem('im3.reactions.guestId');
    if (!guest) {
      guest = 'guest-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('im3.reactions.guestId', guest);
    }
    return guest;
  }

  private readAll(): Record<string, Record<string, ReactionKey>> {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, Record<string, ReactionKey>>): void {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch {
      /* quota — ignore */
    }
  }

  /** Counts per reaction for a target. */
  getCounts(targetId: string): Partial<Record<ReactionKey, number>> {
    const all = this.readAll();
    const map = all[targetId] || {};
    const out: Partial<Record<ReactionKey, number>> = {};
    for (const k of Object.values(map)) {
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  /** Current user's reaction for a target, or null. */
  getMyReaction(targetId: string): ReactionKey | null {
    const all = this.readAll();
    return (all[targetId]?.[this.getUserId()] as ReactionKey) ?? null;
  }

  /**
   * Toggle: if user already has this reaction → remove it.
   * Otherwise set/replace their reaction.
   */
  toggle(targetId: string, key: ReactionKey): void {
    const all = this.readAll();
    const userId = this.getUserId();
    const bucket = all[targetId] || (all[targetId] = {});
    if (bucket[userId] === key) {
      delete bucket[userId];
    } else {
      bucket[userId] = key;
    }
    if (Object.keys(bucket).length === 0) delete all[targetId];
    this.writeAll(all);
  }
}
