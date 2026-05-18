import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../features/auth/auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class KnowledgeBaseService {
  private readonly apiUrl = `${environment.apiUrl}/KnowledgeBase`;

  constructor(
    private http: HttpClient,
    private authService: AuthService) {}

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  // ── Feed / List ──────────────────────────────
  getAll(params?: any): Observable<any[]> {
    const query = new URLSearchParams();
    if (params?.category)      query.set('category', params.category);
    if (params?.search)        query.set('search', params.search);
    if (params?.publishedOnly !== undefined)
      query.set('publishedOnly', params.publishedOnly);
    return this.http.get<any[]>(
      `${this.apiUrl}?${query.toString()}`,
      { headers: this.getHeaders() });
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/${id}`,
      { headers: this.getHeaders() });
  }

  // ── CRUD ─────────────────────────────────────
  create(data: any): Observable<any> {
    return this.http.post(
      this.apiUrl, data,
      { headers: this.getHeaders() });
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/${id}`, data,
      { headers: this.getHeaders() });
  }

  delete(id: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/${id}`,
      { headers: this.getHeaders() });
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.apiUrl}/categories`,
      { headers: this.getHeaders() });
  }

  // ── Reactions ────────────────────────────────
  react(id: string, reactionType: 'like' | 'dislike'): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/react`,
      { reactionType },
      { headers: this.getHeaders() });
  }

  // ── Comments ─────────────────────────────────
  getComments(id: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/${id}/comments`,
      { headers: this.getHeaders() });
  }

  addComment(id: string, text: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/comments`,
      { text },
      { headers: this.getHeaders() });
  }

  updateComment(commentId: string, text: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/comments/${commentId}`,
      { text },
      { headers: this.getHeaders() });
  }

  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/comments/${commentId}`,
      { headers: this.getHeaders() });
  }

  // ── Views ─────────────────────────────────────
  recordView(id: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/view`, {},
      { headers: this.getHeaders() });
  }

  getViewers(id: string): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/${id}/viewers`,
      { headers: this.getHeaders() });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/unread-count`,
      { headers: this.getHeaders() });
  }

  // ── User Feed ─────────────────────────────────
  getUsersWithPosts(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/users-with-posts`,
      { headers: this.getHeaders() });
  }

  getPostsByUser(userId: string, publishedOnly = true): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/by-user/${userId}?publishedOnly=${publishedOnly}`,
      { headers: this.getHeaders() });
  }

  getMyPosts(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/my-posts`,
      { headers: this.getHeaders() });
  }

  // ── Media Upload ──────────────────────────────
  uploadMedia(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    // Don't set Content-Type — browser sets multipart/form-data automatically
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
    return this.http.post(
      `${this.apiUrl}/upload-media`,
      formData,
      { headers });
  }
}