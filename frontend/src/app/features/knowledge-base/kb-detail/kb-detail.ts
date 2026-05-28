import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { KnowledgeBaseService } from '../../../core/services/knowledge-base';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { environment } from '../../../../environments/environment';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-kb-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatButtonModule, MatProgressSpinnerModule, LayoutComponent, HasPermissionDirective
  ],
  templateUrl: './kb-detail.html',
  styleUrls: ['./kb-detail.scss']
})
export class KbDetailComponent implements OnInit {
  private kbService   = inject(KnowledgeBaseService);
  private authService = inject(AuthService);
  private route       = inject(ActivatedRoute);
  public  router      = inject(Router);
  private cdr         = inject(ChangeDetectorRef);
  readonly baseUrl = environment.baseUrl;
  private toastr      = inject(ToastrService);

  article:   any  = null;
  loading        = true;
  userRole       = '';
  articleId      = '';

  // Reactions
  likeCount    = 0;
  dislikeCount = 0;
  myReaction   = '';

  // Comments
  comments:    any[]  = [];
  commentText          = '';
  editingCommentId:  string | null = null;
  editingCommentText = '';

  // Viewers
  articleViewers: any[] = [];
  viewCount  = 0;
  showViewers = false;

  ngOnInit() {
    this.userRole  = this.authService.getUserRole();
    this.articleId = this.route.snapshot.paramMap.get('id') || '';

    this.kbService.getById(this.articleId).subscribe({
      next: (data: any) => {
        this.article     = data;
        this.viewCount   = data.viewCount || 0;
        this.likeCount   = data.likeCount || 0;
        this.dislikeCount = data.dislikeCount || 0;
        this.myReaction  = data.myReaction || '';
        this.comments    = data.comments || [];
        this.loading     = false;
        this.cdr.detectChanges();
        this.kbService.recordView(this.articleId).subscribe();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Reactions ──────────────────────────────
  react(type: 'like' | 'dislike') {
    this.kbService.react(this.articleId, type).subscribe({
      next: (res: any) => {
        this.likeCount    = res.likeCount;
        this.dislikeCount = res.dislikeCount;
        this.myReaction   = res.myReaction;
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to react')
    });
  }

  // ── Comments ───────────────────────────────
  addComment() {
    const text = this.commentText.trim();
    if (!text) return;

    this.kbService.addComment(this.articleId, text).subscribe({
      next: (c: any) => {
        this.comments.push(c);
        this.commentText = '';
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to add comment')
    });
  }

  startEditComment(c: any) {
    this.editingCommentId   = c.id;
    this.editingCommentText = c.text;
    this.cdr.detectChanges();
  }

  saveEditComment(c: any) {
    const text = this.editingCommentText.trim();
    if (!text) return;
    this.kbService.updateComment(c.id, text).subscribe({
      next: (res: any) => {
        c.text = res.text;
        c.updatedAt = new Date().toISOString();
        this.editingCommentId = null;
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to update')
    });
  }

  cancelEdit() {
    this.editingCommentId = null;
    this.cdr.detectChanges();
  }

  deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return;
    this.kbService.deleteComment(commentId).subscribe({
      next: () => {
        this.comments = this.comments.filter(c => c.id !== commentId);
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to delete')
    });
  }

  // ── Viewers ────────────────────────────────
  toggleViewers() {
    this.showViewers = !this.showViewers;
    if (this.showViewers) {
      this.kbService.getViewers(this.articleId).subscribe({
        next: (data: any) => {
          this.articleViewers = data.viewers || [];
          this.viewCount = data.viewCount || 0;
          this.cdr.detectChanges();
        }
      });
    }
    this.cdr.detectChanges();
  }

  // ── Delete Post ────────────────────────────
  deletePost() {
    if (!confirm('Delete this post permanently?')) return;
    this.kbService.delete(this.articleId).subscribe({
      next: () => {
        this.toastr.success('Post deleted');
        this.router.navigate([this.getBackRoute()]);
      },
      error: (err: any) => {
        if (err.status === 403)
          this.toastr.error('You can only delete your own posts');
        else
          this.toastr.error('Failed to delete');
      }
    });
  }

  // ── Helpers ────────────────────────────────
  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#22c55e',
      '#3b82f6','#8b5cf6','#ec4899'
    ];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '')
      .join('').toUpperCase().slice(0, 2);
  }

  getBackRoute(): string {
    return this.userRole === 'Customer' ? '/customer' : '/kb';
  }
}