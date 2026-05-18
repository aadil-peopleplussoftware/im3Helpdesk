import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly apiUrl = `${environment.apiUrl}/Customer`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getMyTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/my-tickets`,
      { headers: this.getHeaders() });
  }

  getMyTicket(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/my-tickets/${id}`,
      { headers: this.getHeaders() });
  }

  submitTicket(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/submit-ticket`, data,
      { headers: this.getHeaders() });
  }

  addReply(id: string, reply: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/my-tickets/${id}/reply`,
      { reply }, { headers: this.getHeaders() });
  }
}