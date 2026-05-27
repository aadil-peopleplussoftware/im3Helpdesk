import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateLeadRequest {
  organizationName: string;
  ownerName: string;
  workEmail: string;
  phone?: string | null;
  notes?: string | null;
}

export interface RegisterOrgRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

@Injectable({ providedIn: 'root' })
export class PublicOnboardingService {
  constructor(private http: HttpClient) {}

  submitLead(payload: CreateLeadRequest): Observable<any> {
    return this.http.post(`${environment.apiUrl}/leads`, payload);
  }

  verifyToken(token: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/auth/verify-token`, {
      params: { token },
      withCredentials: true
    });
  }

  registerOrganization(payload: RegisterOrgRequest): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/register-org`, payload, {
      withCredentials: true
    });
  }
}