import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { ToastrService } from 'ngx-toastr';
import { KnowledgeBaseService } from '../../../services/knowledge-base';
import { AuthService } from '../../../services/auth.service';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { LayoutComponent } from '../../../shared/layout/layout';

@Component({
  selector: 'app-kb-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule,
    MatButtonModule, MatToolbarModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatChipsModule,LayoutComponent
  ],
  templateUrl: './kb-list.html',
  styleUrls: ['./kb-list.scss']
})
export class KbListComponent implements OnInit {
  private kbService = inject(KnowledgeBaseService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  articles: any[] = [];
  categories: string[] = [];
  loading = true;
  userRole = '';

  filterForm: FormGroup = this.fb.group({
    search: [''],
    category: ['']
  });

  ngOnInit() {
    this.userRole = this.authService.getUserRole();
    this.loadArticles();
    this.loadCategories();

    this.filterForm.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.loadArticles());
  }

  loadArticles() {
    this.loading = true;
    const { search, category } = this.filterForm.value;
    const publishedOnly = this.userRole === 'Customer';

    this.kbService.getAll({ search, category, publishedOnly }).subscribe({
      next: (data: any[]) => {
        this.articles = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadCategories() {
    this.kbService.getCategories().subscribe({
      next: (data: string[]) => {
        this.categories = data;
        this.cdr.detectChanges();
      }
    });
  }

  deleteArticle(id: string) {
    if (!confirm('Delete this article?')) return;
    this.kbService.delete(id).subscribe({
      next: () => {
        this.toastr.success('Article deleted');
        this.loadArticles();
      },
      error: () => this.toastr.error('Failed to delete')
    });
  }

  canManage(): boolean {
    return this.userRole === 'CompanyAdmin' ||
      this.userRole === 'Agent';
  }

  logout() {
    this.authService.logout();
  }
}