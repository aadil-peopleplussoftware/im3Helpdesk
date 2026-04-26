import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService }
  from '../../../services/auth.service';
import { LayoutComponent }
  from '../../../shared/layout/layout';

@Component({
  selector: 'app-todo-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LayoutComponent
  ],
  templateUrl: './todo-list.component.html',
  styleUrls: ['./todo-list.component.scss']
})
export class TodoListComponent implements OnInit {

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  todos: any[] = [];
  filteredTodos: any[] = [];
  loading = true;
  newTitle = '';
  filterStatus: 'all' | 'pending' | 'done' = 'all';
  searchQuery = '';
  sortField: 'createdAt' | 'title' = 'createdAt';
  sortDir: 'asc' | 'desc' = 'desc';

  get pendingCount() {
    return this.todos.filter(
      t => !t.isCompleted).length;
  }

  get doneCount() {
    return this.todos.filter(
      t => t.isCompleted).length;
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    this.loadTodos();
  }

  loadTodos() {
    this.loading = true;
    this.http.get<any[]>(
      'https://localhost:7071/api/Todo',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.todos = data;
        this.applyFilter();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilter() {
    let result = [...this.todos];

    // Status filter
    if (this.filterStatus === 'pending')
      result = result.filter(
        t => !t.isCompleted);
    else if (this.filterStatus === 'done')
      result = result.filter(t => t.isCompleted);

    // Search
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.ticketNumber?.toString().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      const va = a[this.sortField];
      const vb = b[this.sortField];
      const dir = this.sortDir === 'asc' ? 1 : -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    this.filteredTodos = result;
    this.cdr.detectChanges();
  }

  setFilter(f: 'all' | 'pending' | 'done') {
    this.filterStatus = f;
    this.applyFilter();
  }

  toggleSort(field: 'createdAt' | 'title') {
    if (this.sortField === field)
      this.sortDir =
        this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.applyFilter();
  }

  addTodo() {
    if (!this.newTitle.trim()) return;

    this.http.post<any>(
      'https://localhost:7071/api/Todo',
      { title: this.newTitle.trim() },
      { headers: this.getHeaders() }
    ).subscribe({
      next: (todo) => {
        this.todos.unshift(todo);
        this.newTitle = '';
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: () => {
        Promise.resolve().then(() =>
          this.toastr.error('Failed to add task')
        );
      }
    });
  }

  toggleTodo(todo: any) {
    this.http.put<any>(
      `https://localhost:7071/api/Todo` +
      `/${todo.id}/toggle`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: (res) => {
        todo.isCompleted = res.isCompleted;
        todo.completedAt = res.isCompleted
          ? new Date().toISOString() : null;
        this.applyFilter();
        this.cdr.detectChanges();
      }
    });
  }

  deleteTodo(id: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this task?')) return;

    this.http.delete(
      `https://localhost:7071/api/Todo/${id}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.todos =
          this.todos.filter(t => t.id !== id);
        this.applyFilter();
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Task deleted')
        );
      }
    });
  }

  clearAllDone() {
    const done =
      this.todos.filter(t => t.isCompleted);
    if (!done.length) return;

    Promise.all(
      done.map(t =>
        this.http.delete(
          `https://localhost:7071/api/Todo/${t.id}`,
          { headers: this.getHeaders() }
        ).toPromise()
      )
    ).then(() => {
      this.todos =
        this.todos.filter(t => !t.isCompleted);
      this.applyFilter();
      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.success(
          `${done.length} completed tasks cleared`)
      );
    });
  }

  goToTicket(todo: any) {
    if (todo.ticketId)
      this.router.navigate(
        ['/tickets', todo.ticketId]);
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff =
      Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr)
      .toLocaleDateString('en-US',
        { day: 'numeric', month: 'short' });
  }
}