import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
private readonly apiUrl = `${environment.apiUrl}/SuperAdmin`;


  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`,
      { headers: this.getHeaders() });
  }

  getOrganizations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/organizations`,
      { headers: this.getHeaders() });
  }

  toggleOrganization(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/organizations/${id}/toggle`, {},
      { headers: this.getHeaders() });
  }

  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users`,
      { headers: this.getHeaders() });
  }
}