import {
  Component, OnInit, Output, EventEmitter,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService }
  from '../../../services/auth.service';

@Component({
  selector: 'app-todo-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './todo-panel.html',
  styleUrls: ['./todo-panel.scss']
})
export class TodoPanelComponent implements OnInit {

  @Output() close = new EventEmitter<void>();

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  todos: any[] = [];
  newTitle = '';

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
    this.http.get<any[]>(
      'https://localhost:7071/api/Todo',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.todos = data;
        this.cdr.detectChanges();
      }
    });
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
        this.cdr.detectChanges();
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
        this.cdr.detectChanges();
      }
    });
  }

  deleteTodo(id: string) {
    this.http.delete(
      `https://localhost:7071/api/Todo/${id}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.todos =
          this.todos.filter(t => t.id !== id);
        this.cdr.detectChanges();
      }
    });
  }

  clearDone() {
    const done =
      this.todos.filter(t => t.isCompleted);
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
      this.cdr.detectChanges();
    });
  }

  goToTicket(todo: any) {
    if (todo.ticketId) {
      this.close.emit();
      this.router.navigate(
        ['/tickets', todo.ticketId]);
    }
  }
}