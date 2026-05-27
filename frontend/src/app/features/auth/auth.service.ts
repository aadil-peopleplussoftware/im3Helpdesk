import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import {
  REFRESH_TOKEN_KEY,
  TOKEN_KEY
} from '../../core/constants/auth.constants';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/Auth`;

  constructor(private http: HttpClient, private router: Router) {}

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data,
      { withCredentials: true });
  }

  login(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, data,
      { withCredentials: true }).pipe(
      tap(res => this.persistAuthTokens(res))
    );
  }

verifyOtp(dto: { email: string; otp: string }) {
  return this.http.post<any>(
    `${this.apiUrl}/verify-otp`,   // ✅ sirf /verify-otp
    dto,
    { withCredentials: true }
  ).pipe(
    tap(res => this.persistAuthTokens(res))
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
    localStorage.setItem(TOKEN_KEY, token);
  }

  saveRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  }

  saveUserData(data: any): void {
    this.persistAuthTokens(data);
    localStorage.setItem('im3_isFirstLogin', data.isFirstLogin?.toString() || 'false');
    localStorage.setItem('im3_role', data.user?.role || '');
    localStorage.setItem('im3_name', data.user?.fullName || '');
    localStorage.setItem('im3_orgName', data.user?.organizationName || '');
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  refreshAccessToken(): Observable<any> {
    return this.refreshToken();
  }

  refreshToken(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    const payload = refreshToken
      ? { refreshToken }
      : {};

    return this.http.post<any>(`${this.apiUrl}/refresh`, payload,
      { withCredentials: true }).pipe(
      tap(res => this.persistAuthTokens(res))
    );
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  isFirstLogin(): boolean {
    return localStorage.getItem('im3_isFirstLogin') === 'true';
  }

  markFirstLoginComplete(): void {
    localStorage.setItem('im3_isFirstLogin', 'false');
  }

  getUserRole(): string {
    return localStorage.getItem('im3_role') || '';
  }

  getUserName(): string {
    return localStorage.getItem('im3_name') || '';
  }

  isTokenValid(): boolean {
    return this.isAuthenticated();
}

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !this.isTokenExpired(token);
  }

  isTokenExpired(token?: string | null): boolean {
    const activeToken = token ?? this.getToken();
    if (!activeToken) return true;

    try {
      const payload = JSON.parse(atob(activeToken.split('.')[1]));
      const exp = Number(payload?.exp);
      if (!exp) return true;
      return Date.now() >= exp * 1000;
    } catch {
      return true;
    }
}

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('im3_isFirstLogin');
    localStorage.removeItem('im3_role');
    localStorage.removeItem('im3_name');
    localStorage.removeItem('im3_orgName'); // Clear org name on logout
    this.router.navigate(['/auth/login']);
  }

  private persistAuthTokens(response: any): void {
    if (response?.token) {
      this.saveToken(response.token);
    }
    if (response?.refreshToken) {
      this.saveRefreshToken(response.refreshToken);
    }
  }
}