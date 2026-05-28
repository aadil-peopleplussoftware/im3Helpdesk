import {
  Component, OnInit, Output, EventEmitter,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';

@Component({
  selector: 'app-todo-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  templateUrl: './todo-panel.html',
  styleUrls: ['./todo-panel.scss']
})
export class TodoPanelComponent implements OnInit {

  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<number>();

  private http = inject(HttpClient);
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

  ngOnInit() {
    this.loadTodos();
  }

  loadTodos() {
    this.http.get<any[]>(`${environment.apiUrl}/Todo`).subscribe({
      next: (data) => {
        this.todos = data;
        this.changed.emit(this.pendingCount);
        this.cdr.detectChanges();
      }
    });
  }

  addTodo() {
    if (!this.newTitle.trim()) return;

    this.http.post<any>(
      `${environment.apiUrl}/Todo`,
      { title: this.newTitle.trim() }
    ).subscribe({
      next: (todo) => {
        this.todos.unshift(todo);
        this.newTitle = '';
        this.changed.emit(this.pendingCount);
        this.cdr.detectChanges();
      }
    });
  }

  toggleTodo(todo: any) {
    this.http.put<any>(
      `${environment.apiUrl}/Todo` +
      `/${todo.id}/toggle`,
      {}
    ).subscribe({
      next: (res) => {
        todo.isCompleted = res.isCompleted;
        this.changed.emit(this.pendingCount);
        this.cdr.detectChanges();
      }
    });
  }

  deleteTodo(id: string) {
    this.http.delete(`${environment.apiUrl}/Todo/${id}`).subscribe({
      next: () => {
        this.todos =
          this.todos.filter(t => t.id !== id);
        this.changed.emit(this.pendingCount);
        this.cdr.detectChanges();
      }
    });
  }

  clearDone() {
    const done =
      this.todos.filter(t => t.isCompleted);
    Promise.all(
      done.map(t =>
        this.http.delete(`${environment.apiUrl}/Todo/${t.id}`).toPromise()
      )
    ).then(() => {
      this.todos =
        this.todos.filter(t => !t.isCompleted);
      this.changed.emit(this.pendingCount);
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