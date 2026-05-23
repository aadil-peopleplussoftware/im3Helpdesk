import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private apiUrl = `${environment.apiUrl}/Agents`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  invite(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/invite`, data);
  }

  updateRole(id: string, role: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/role`,
      { role });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}