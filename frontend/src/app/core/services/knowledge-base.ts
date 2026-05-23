import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class KnowledgeBaseService {
  private readonly apiUrl = `${environment.apiUrl}/KnowledgeBase`;

  constructor(private http: HttpClient) {}

  // ── Feed / List ──────────────────────────────
  getAll(params?: any): Observable<any[]> {
    const query = new URLSearchParams();
    if (params?.category)      query.set('category', params.category);
    if (params?.search)        query.set('search', params.search);
    if (params?.publishedOnly !== undefined)
      query.set('publishedOnly', params.publishedOnly);
    return this.http.get<any[]>(`${this.apiUrl}?${query.toString()}`);
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  // ── CRUD ─────────────────────────────────────
  create(data: any): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/categories`);
  }

  // ── Reactions ────────────────────────────────
  react(id: string, reactionType: 'like' | 'dislike'): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/react`,
      { reactionType });
  }

  // ── Comments ─────────────────────────────────
  getComments(id: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${id}/comments`);
  }

  addComment(id: string, text: string): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/${id}/comments`,
      { text });
  }

  updateComment(commentId: string, text: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/comments/${commentId}`,
      { text });
  }

  deleteComment(commentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/comments/${commentId}`);
  }

  // ── Views ─────────────────────────────────────
  recordView(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/view`, {});
  }

  getViewers(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}/viewers`);
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/unread-count`);
  }

  // ── User Feed ─────────────────────────────────
  getUsersWithPosts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users-with-posts`);
  }

  getPostsByUser(userId: string, publishedOnly = true): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/by-user/${userId}?publishedOnly=${publishedOnly}`);
  }

  getMyPosts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/my-posts`);
  }

  // ── Media Upload ──────────────────────────────
  uploadMedia(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    // Don't set Content-Type — browser sets multipart/form-data automatically
    return this.http.post(`${this.apiUrl}/upload-media`, formData);
  }
}