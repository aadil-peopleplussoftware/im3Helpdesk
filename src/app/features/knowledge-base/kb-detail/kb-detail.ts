import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule }
  from '@angular/material/progress-spinner';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { KnowledgeBaseService }
  from '../../../services/knowledge-base';
import { AuthService }
  from '../../../services/auth.service';
import { LayoutComponent }
  from '../../../shared/layout/layout';

@Component({
  selector: 'app-kb-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatButtonModule, MatCardModule,
    MatProgressSpinnerModule, LayoutComponent
  ],
  templateUrl: './kb-detail.html',
  styleUrls: ['./kb-detail.scss']
})
export class KbDetailComponent implements OnInit {
  private kbService = inject(KnowledgeBaseService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  article: any = null;
  loading = true;
  userRole = '';
  articleId = '';

  // ✅ Viewers
  articleViewers: any[] = [];
  viewCount = 0;
  showViewers = false;

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    this.userRole = this.authService.getUserRole();
    this.articleId =
      this.route.snapshot.paramMap.get('id') || '';

    this.kbService.getById(this.articleId).subscribe({
      next: (data: any) => {
        this.article = data;
        this.viewCount = data.viewCount || 0;
        this.loading = false;
        this.cdr.detectChanges();
        // Record view
        this.recordView();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ✅ Record that user viewed this article
  recordView() {
    this.http.post(
      `https://localhost:7071/api/KnowledgeBase` +
      `/${this.articleId}/view`,
      {},
      { headers: this.getHeaders() }
    ).subscribe();
  }

  // ✅ Load list of who viewed
  loadViewers() {
    this.http.get<any>(
      `https://localhost:7071/api/KnowledgeBase` +
      `/${this.articleId}/viewers`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.articleViewers = data.viewers || [];
        this.viewCount = data.viewCount || 0;
        this.cdr.detectChanges();
      }
    });
  }

  // ✅ Toggle viewers panel
  toggleViewers() {
    this.showViewers = !this.showViewers;
    if (this.showViewers) this.loadViewers();
    this.cdr.detectChanges();
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#22c55e',
      '#3b82f6','#8b5cf6','#ec4899'
    ];
    return colors[
      (name?.charCodeAt(0) || 0) % colors.length];
  }

  canManage(): boolean {
    return this.userRole === 'CompanyAdmin' ||
      this.userRole === 'Agent';
  }

  getBackRoute(): string {
    return this.userRole === 'Customer'
      ? '/customer' : '/kb';
  }
}