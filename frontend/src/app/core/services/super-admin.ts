import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private readonly apiUrl = `${environment.apiUrl}/SuperAdmin`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  getOrganizations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/organizations`);
  }

  toggleOrganization(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/organizations/${id}/toggle`, {});
  }

  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users`);
  }

  getLeads(status?: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/admin/leads`, {
      params: status ? { status } : {}
    });
  }

  getLeadSummary(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/admin/leads/summary`);
  }

  approveLead(id: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/admin/leads/${id}/approve`, {});
  }

  rejectLead(id: string, reason?: string): Observable<any> {
    const body = reason ? { reason } : {};
    return this.http.post<any>(`${environment.apiUrl}/admin/leads/${id}/reject`, body);
  }
}