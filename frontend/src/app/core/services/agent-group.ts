import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentGroupService {
  private readonly apiUrl = `${environment.apiUrl}/AgentGroups`;

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

  addMember(groupId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${groupId}/members`,
      { userId }, { headers: this.getHeaders() });
  }

  removeMember(groupId: string, userId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${groupId}/members/${userId}`,
      { headers: this.getHeaders() });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }
}