import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/Auth`;

  constructor(private http: HttpClient, private router: Router) {}

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data,
      { withCredentials: true });
  }

  login(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, data,
      { withCredentials: true });
  }

verifyOtp(dto: { email: string; otp: string }) {
  return this.http.post<any>(
    `${this.apiUrl}/verify-otp`,   // ✅ sirf /verify-otp
    dto,
    { withCredentials: true }
  );
}

resendOtp(dto: { email: string }) {
  return this.http.post<any>(
    `${this.apiUrl}/resend-otp`,   // ✅ sirf /resend-otp
    dto,
    { withCredentials: true }
  );
}

  forgotPassword(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, data,
      { withCredentials: true });
  }

  verifyEmail(token: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email?token=${token}`, {},
      { withCredentials: true });
  }

  registerCustomer(data: any): Observable<any> {
  return this.http.post(
    `${this.apiUrl}/register-customer`, data,
    { withCredentials: true });
}

  saveToken(token: string): void {
    void token;
  }

  saveUserData(data: any): void {
    localStorage.setItem('im3_isFirstLogin', data.isFirstLogin?.toString() || 'false');
    localStorage.setItem('im3_role', data.user?.role || '');
    localStorage.setItem('im3_name', data.user?.fullName || '');
    localStorage.setItem('im3_orgName', data.user?.organizationName || '');
  }

  getToken(): string | null {
  return null;
}

  getRefreshToken(): string | null {
    return null;
  }

  refreshAccessToken(): Observable<any> {
    return this.http.post(`${this.apiUrl}/refresh`, {},
      { withCredentials: true });
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('im3_role');
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

  isTokenValid(): boolean {
  return this.isLoggedIn();
}

  logout(): void {
    localStorage.removeItem('im3_isFirstLogin');
    localStorage.removeItem('im3_role');
    localStorage.removeItem('im3_name');
    localStorage.removeItem('im3_orgName'); // Clear org name on logout
    this.router.navigate(['/login']);
  }
}