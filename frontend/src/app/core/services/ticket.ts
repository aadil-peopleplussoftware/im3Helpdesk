import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private apiUrl = `${environment.apiUrl}/Tickets`;
  private http = inject(HttpClient);

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }


  getById(id: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/Tickets/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}/status`,
      { status }
    );
  }

  // agentId → assignedToUserId (backend field name fix)
  assign(id: string, agentId: string | null): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}/assign`,
      { assignedToUserId: agentId }
    );
  }

  addComment(
    id: string,
    comment: string,
    isInternal: boolean = false): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/comments`,
      { comment, isInternal }
    );
  }

  // tags array as-is — backend expects string[] not comma-joined string
  updateTags(id: string, tags: string[]): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}/tags`,
      { tags }
    );
  }

  getByTag(tag: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/by-tag/${tag}`);
  }

  // Backend: [HttpPut] — PUT sahi hai
  logTime(id: string, minutes: number, note?: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}/log-time`,
      { minutes, note }
    );
  }

  search(params: {
    query?: string;
    status?: string;
    priority?: string;
    category?: string;
  }): Observable<any[]> {
    const query = new URLSearchParams();
    if (params.query)    query.set('query',    params.query);
    if (params.status)   query.set('status',   params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.category) query.set('category', params.category);
    return this.http.get<any[]>(`${this.apiUrl}/search?${query.toString()}`);
  }

  bulkUpdate(data: any): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/bulk-update`,
      data
    );
  }

  // Export with optional status/priority filters
  exportTickets(status?: string, priority?: string): Observable<Blob> {
    const params = new URLSearchParams();
    if (status)   params.set('status',   status);
    if (priority) params.set('priority', priority);
    return this.http.get(
      `${this.apiUrl}/export?${params.toString()}`,
      {
        responseType: 'blob'
      }
    );
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Poll single ticket every 15 seconds
  pollTicket(id: string): Observable<any> {
    return interval(15000).pipe(
      switchMap(() => this.getById(id))
    );
  }

  // Poll ticket list every 30 seconds
  pollTickets(): Observable<any[]> {
    return interval(30000).pipe(
      switchMap(() => this.getAll())
    );
  }
}