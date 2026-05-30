import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type ReactionKey =
  | 'like' | 'heart' | 'laugh' | 'wow' | 'sad' | 'dislike';

export interface ReactionState {
  counts: Partial<Record<ReactionKey, number>>;
  myReaction: ReactionKey | null;
}

@Injectable({ providedIn: 'root' })
export class ReactionService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/comments`;

  /** Load counts + caller's reaction for a single comment. */
  load(commentId: string): Observable<ReactionState> {
    return this.http.get<ReactionState>(`${this.base}/${commentId}/reactions`);
  }

  /**
   * Toggle reaction on a comment.
   * Same type → removes. Different type → replaces.
   * Returns fresh state after the change.
   */
  toggle(commentId: string, reactionType: ReactionKey): Observable<ReactionState> {
    return this.http.post<ReactionState>(
      `${this.base}/${commentId}/reactions`,
      { reactionType }
    );
  }
}

