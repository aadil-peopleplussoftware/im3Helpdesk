import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly apiUrl = `${environment.apiUrl}/Customer`;

  constructor(private http: HttpClient) {}

  getMyTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/my-tickets`);
  }

  getMyTicket(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/my-tickets/${id}`);
  }

  submitTicket(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/submit-ticket`, data);
  }

  addReply(id: string, reply: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/my-tickets/${id}/reply`,
      { reply });
  }
}