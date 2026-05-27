import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Row returned by GET /api/recycle-bin/tickets (one per soft-deleted ticket). */
export interface DeletedTicketRow {
  id: string;
  ticketNumber: number;
  title: string;
  category: string;
  status: string | number;
  priority: string | number;
  fromEmail: string | null;
  fromName: string | null;
  createdAt: string;
  deletedAt: string;
  deletedByUserId: string | null;
  deletedByName: string | null;
  assignedToName: string | null;
  /** UTC ISO string after which the daily purge worker will hard-delete this row. */
  purgeAfter: string | null;
}

/** Full ticket detail returned by GET /api/recycle-bin/tickets/{id}. */
export interface DeletedTicketDetail extends DeletedTicketRow {
  description: string;
  tags: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  slaDeadline: string | null;
  isSlaBreached: boolean;
  slaStatus: string | null;
  timeSpentMinutes: number;
  ticketType: string;
  createdByName: string | null;
}

export interface RecycleBinListResponse {
  retention: { value: number; unit: string };
  items: DeletedTicketRow[];
}

@Injectable({ providedIn: 'root' })
export class RecycleBinService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/recycle-bin`;

  list(search?: string): Observable<RecycleBinListResponse> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<RecycleBinListResponse>(
      `${this.base}/tickets`,
      { params }
    );
  }

  get(id: string): Observable<DeletedTicketDetail> {
    return this.http.get<DeletedTicketDetail>(`${this.base}/tickets/${id}`);
  }

  restore(id: string): Observable<any> {
    return this.http.post(`${this.base}/tickets/${id}/restore`, {});
  }

  purge(id: string): Observable<any> {
    return this.http.delete(`${this.base}/tickets/${id}/purge`);
  }
}
