import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private apiUrl = `${environment.apiUrl}/Agents`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  invite(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/invite`, data, { headers: this.getHeaders() });
  }

  updateRole(id: string, role: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/role`,
      { role }, { headers: this.getHeaders() });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }
}