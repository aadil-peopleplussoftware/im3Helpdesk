import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentGroupService {
  private readonly apiUrl = `${environment.apiUrl}/AgentGroups`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  addMember(groupId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${groupId}/members`,
      { userId });
  }

  removeMember(groupId: string, userId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${groupId}/members/${userId}`);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}