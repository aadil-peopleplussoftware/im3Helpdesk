import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CustomFieldService {
  private apiUrl = 'https://localhost:7071/api/CustomFields';

  constructor(
    private http: HttpClient,
    private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(
      this.apiUrl, { headers: this.getHeaders() });
  }

  create(data: any): Observable<any> {
    return this.http.post(
      this.apiUrl, data, { headers: this.getHeaders() });
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}`, data,
      { headers: this.getHeaders() });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  getTicketValues(ticketId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/ticket/${ticketId}/values`,
      { headers: this.getHeaders() });
  }

  saveTicketValues(ticketId: string, values: any[]): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/ticket/${ticketId}/values`,
      values, { headers: this.getHeaders() });
  }
}