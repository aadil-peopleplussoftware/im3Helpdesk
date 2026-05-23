import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomFieldService {
  private readonly apiUrl = `${environment.apiUrl}/CustomFields`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getTicketValues(ticketId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/ticket/${ticketId}/values`);
  }

  saveTicketValues(ticketId: string, values: any[]): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/ticket/${ticketId}/values`,
      values);
  }
}