import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = 'https://localhost:7071/api/Auth';

  constructor(private http: HttpClient, private router: Router) {}

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  login(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, data);
  }

  forgotPassword(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, data);
  }

  verifyEmail(token: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email?token=${token}`, {});
  }

  registerCustomer(data: any): Observable<any> {
  return this.http.post(
    `${this.apiUrl}/register-customer`, data);
}

  saveToken(token: string): void {
    localStorage.setItem('im3_token', token);
  }

  saveUserData(data: any): void {
    localStorage.setItem('im3_token', data.token);
    localStorage.setItem('im3_refresh', data.refreshToken || '');
    localStorage.setItem('im3_isFirstLogin', data.isFirstLogin?.toString() || 'false');
    localStorage.setItem('im3_role', data.user?.role || '');
    localStorage.setItem('im3_name', data.user?.fullName || '');
    localStorage.setItem('im3_orgName', data.user?.organizationName || '');
  }

  getToken(): string | null {
    return localStorage.getItem('im3_token');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('im3_refresh');
  }

  refreshAccessToken(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    return this.http.post(`${this.apiUrl}/refresh`, { refreshToken });
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isFirstLogin(): boolean {
    return localStorage.getItem('im3_isFirstLogin') === 'true';
  }

  getUserRole(): string {
    return localStorage.getItem('im3_role') || '';
  }

  getUserName(): string {
    return localStorage.getItem('im3_name') || '';
  }

  logout(): void {
    localStorage.removeItem('im3_token');
    localStorage.removeItem('im3_refresh'); // Clear refresh token on logout
    localStorage.removeItem('im3_isFirstLogin');
    localStorage.removeItem('im3_role');
    localStorage.removeItem('im3_name');
    localStorage.removeItem('im3_orgName'); // Clear org name on logout
    this.router.navigate(['/login']);
  }
}