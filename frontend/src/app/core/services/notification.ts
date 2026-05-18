import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private apiUrl = `${environment.apiUrl}/Notifications`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/unread-count`,
      { headers: this.getHeaders() });
  }

  markRead(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/read`, {},
      { headers: this.getHeaders() });
  }

  markAllRead(): Observable<any> {
    return this.http.put(`${this.apiUrl}/mark-all-read`, {},
      { headers: this.getHeaders() });
  }

  getActivity(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/activity`,
      { headers: this.getHeaders() });
  }
}