import {
  Component, OnInit, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { KnowledgeBaseService } from '../../../core/services/knowledge-base';
import { AuthService } from '../../auth/auth.service';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-kb-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, ReactiveFormsModule,
    MatProgressSpinnerModule, LayoutComponent, HasPermissionDirective
  ],
  templateUrl: './kb-list.html',
  styleUrls: ['./kb-list.scss']
})
export class KbListComponent implements OnInit {
  private kbService   = inject(KnowledgeBaseService);
  private authService = inject(AuthService);
  public  router      = inject(Router);
  private toastr      = inject(ToastrService);
  private fb          = inject(FormBuilder);
  readonly baseUrl = environment.baseUrl;
  private cdr         = inject(ChangeDetectorRef);

  articles:    any[]    = [];
  categories:  string[] = [];
  usersWithPosts: any[] = [];
  loading      = true;
  userRole     = '';

  // Sidebar state
  // null = All posts, 'me' = My posts, userId string = that user's posts
  selectedUserId: string | null = null;
  selectedUserName = 'All Posts';
  isMyPostsView = false;

  filterForm: FormGroup = this.fb.group({
    search:   [''],
    category: ['']
  });

  // Comment state
  openCommentBoxId: string | null = null;
  commentTexts: Record<string, string> = {};
  showCommentsFor: string | null = null;

  ngOnInit() {
    this.userRole = this.authService.getUserRole();
    this.loadArticles();
    this.loadCategories();
    this.loadUsersWithPosts();

    this.filterForm.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.loadArticles());
  }

  // ── Load Feed ───────────────────────────────────
  loadArticles() {
    this.loading = true;
    this.cdr.detectChanges();

    // My Posts view
    if (this.isMyPostsView) {
      this.kbService.getMyPosts().subscribe({
        next: (data) => { this.articles = data; this.loading = false; this.cdr.detectChanges(); },
        error: () => { this.loading = false; this.cdr.detectChanges(); }
      });
      return;
    }

    // Specific user's posts
    if (this.selectedUserId) {
      const publishedOnly = this.userRole === 'Customer';
      this.kbService.getPostsByUser(this.selectedUserId, publishedOnly).subscribe({
        next: (data) => { this.articles = data; this.loading = false; this.cdr.detectChanges(); },
        error: () => { this.loading = false; this.cdr.detectChanges(); }
      });
      return;
    }

    // All posts (default)
    const { search, category } = this.filterForm.value;
    const publishedOnly = this.userRole === 'Customer';
    this.kbService.getAll({ search, category, publishedOnly }).subscribe({
      next: (data: any[]) => { this.articles = data; this.loading = false; this.cdr.detectChanges(); },
      error: () => { this.loading = false; this.cdr.detectChanges(); }
    });
  }

  loadCategories() {
    this.kbService.getCategories().subscribe({
      next: (data) => { this.categories = data; this.cdr.detectChanges(); }
    });
  }

  loadUsersWithPosts() {
    this.kbService.getUsersWithPosts().subscribe({
      next: (data) => { this.usersWithPosts = data; this.cdr.detectChanges(); }
    });
  }

  // ── Sidebar Navigation ──────────────────────────
  selectAllPosts() {
    this.selectedUserId   = null;
    this.selectedUserName = 'All Posts';
    this.isMyPostsView    = false;
    this.loadArticles();
  }

  selectMyPosts() {
    this.selectedUserId   = null;
    this.selectedUserName = 'My Posts';
    this.isMyPostsView    = true;
    this.loadArticles();
  }

  selectUser(user: any) {
    this.selectedUserId   = user.userId;
    this.selectedUserName = user.userName;
    this.isMyPostsView    = false;
    this.loadArticles();
  }

  // ── Reactions ──────────────────────────────────
  onReact(article: any, type: 'like' | 'dislike', event: Event) {
    event.stopPropagation();
    this.kbService.react(article.id, type).subscribe({
      next: (res: any) => {
        article.likeCount    = res.likeCount;
        article.dislikeCount = res.dislikeCount;
        article.myReaction   = res.myReaction;
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to react')
    });
  }

  // ── Comments ───────────────────────────────────
  toggleCommentBox(articleId: string, event: Event) {
    event.stopPropagation();
    this.openCommentBoxId =
      this.openCommentBoxId === articleId ? null : articleId;
    this.showCommentsFor = this.openCommentBoxId;
    this.cdr.detectChanges();
  }

  submitComment(article: any, event: Event) {
    event.stopPropagation();
    const text = (this.commentTexts[article.id] || '').trim();
    if (!text) return;
    this.kbService.addComment(article.id, text).subscribe({
      next: (c: any) => {
        if (!article.commentList) article.commentList = [];
        article.commentList.push(c);
        article.commentCount = (article.commentCount || 0) + 1;
        this.commentTexts[article.id] = '';
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to add comment')
    });
  }

  loadCommentsForPost(article: any) {
    if (article.commentList) return;
    this.kbService.getComments(article.id).subscribe({
      next: (data: any[]) => {
        article.commentList = data;
        this.cdr.detectChanges();
      }
    });
  }

  deleteComment(article: any, commentId: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this comment?')) return;
    this.kbService.deleteComment(commentId).subscribe({
      next: () => {
        article.commentList = article.commentList
          .filter((c: any) => c.id !== commentId);
        article.commentCount = Math.max(0, article.commentCount - 1);
        this.cdr.detectChanges();
      },
      error: () => this.toastr.error('Failed to delete comment')
    });
  }

  // ── Delete Post ────────────────────────────────
  deleteArticle(id: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this post?')) return;
    this.kbService.delete(id).subscribe({
      next: () => {
        this.toastr.success('Post deleted');
        this.articles = this.articles.filter(a => a.id !== id);
        this.loadUsersWithPosts(); // refresh sidebar counts
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err.status === 403)
          this.toastr.error('You can only delete your own posts');
        else
          this.toastr.error('Failed to delete');
      }
    });
  }

  goToDetail(id: string) {
    this.router.navigate(['/kb', id]);
  }

  // ── Helpers ────────────────────────────────────
  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#eab308',
      '#22c55e','#3b82f6','#8b5cf6','#ec4899'
    ];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '')
      .join('').toUpperCase().slice(0, 2);
  }

  canManage(): boolean {
    return this.userRole === 'CompanyAdmin' || this.userRole === 'Agent';
  }
}