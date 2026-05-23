import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent }
  from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

export type Priority = 'high' | 'medium' | 'low';

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
  createdAt: string;
}

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
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  todos: any[] = [];
  filteredTodos: any[] = [];
  loading = true;
  newTitle = '';
  newPriority: Priority = 'medium';

  // ⭐ Default is PENDING — not all
  filterStatus: 'all' | 'pending' | 'done' = 'pending';
  filterPriority: 'all' | 'high' | 'medium' | 'low' = 'all';

  searchQuery = '';
  sortField: 'createdAt' | 'title' = 'createdAt';
  sortDir: 'asc' | 'desc' = 'desc';

  // Drag & Drop
  dragIndex: number | null = null;
  dragOverIndex: number | null = null;

  // Subtask state
  expandedTodoId: string | null = null;
  newSubTaskTitles: Record<string, string> = {};

  get pendingCount() {
    return this.todos.filter(t => !t.isCompleted).length;
  }

  get doneCount() {
    return this.todos.filter(t => t.isCompleted).length;
  }

  ngOnInit() {
    this.loadTodos();
  }

  loadTodos() {
    this.loading = true;
    this.http.get<any[]>(`${environment.apiUrl}/Todo`).subscribe({
      next: (data) => {
        const savedPriorities = this.loadPriorityMap();
        const savedSubtasks = this.loadSubtaskMap();
        this.todos = data.map(t => ({
          ...t,
          priority: savedPriorities[t.id] ?? 'medium',
          subTasks: savedSubtasks[t.id] ?? []
        }));
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

    if (this.filterStatus === 'pending')
      result = result.filter(t => !t.isCompleted);
    else if (this.filterStatus === 'done')
      result = result.filter(t => t.isCompleted);

    // Priority filter
    if (this.filterPriority !== 'all')
      result = result.filter(
        t => (t.priority || 'medium') === this.filterPriority);

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.ticketNumber?.toString().includes(q)
      );
    }

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

  setPriorityFilter(p: 'all' | 'high' | 'medium' | 'low') {
    this.filterPriority = p;
    this.applyFilter();
  }

  toggleSort(field: 'createdAt' | 'title') {
    if (this.sortField === field)
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.applyFilter();
  }

  addTodo() {
    if (!this.newTitle.trim()) return;

    this.http.post<any>(
      `${environment.apiUrl}/Todo`,
      { title: this.newTitle.trim() }
    ).subscribe({
      next: (todo) => {
        todo.priority = this.newPriority;
        todo.subTasks = [];
        this.todos.unshift(todo);
        this.savePriorityMap();
        this.newTitle = '';
        this.newPriority = 'medium';
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
      `${environment.apiUrl}/Todo/${todo.id}/toggle`,
      {}
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

    this.http.delete(`${environment.apiUrl}/Todo/${id}`).subscribe({
      next: () => {
        this.todos = this.todos.filter(t => t.id !== id);
        if (this.expandedTodoId === id)
          this.expandedTodoId = null;
        this.savePriorityMap();
        this.saveSubtaskMap();
        this.applyFilter();
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Task deleted')
        );
      }
    });
  }

  clearAllDone() {
    const done = this.todos.filter(t => t.isCompleted);
    if (!done.length) return;

    Promise.all(
      done.map(t =>
        this.http.delete(`${environment.apiUrl}/Todo/${t.id}`).toPromise()
      )
    ).then(() => {
      this.todos = this.todos.filter(t => !t.isCompleted);
      this.savePriorityMap();
      this.saveSubtaskMap();
      this.applyFilter();
      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.success(
          `${done.length} completed tasks cleared`)
      );
    });
  }

  setPriority(todo: any, priority: Priority, event: Event) {
    event.stopPropagation();
    todo.priority = priority;
    this.savePriorityMap();
    this.cdr.detectChanges();
  }

  goToTicket(todo: any, event: Event) {
    event.stopPropagation();
    if (todo.ticketId)
      this.router.navigate(['/tickets', todo.ticketId]);
  }

  // ─── Sub-tasks ───────────────────────────────

  toggleExpand(todoId: string) {
    this.expandedTodoId =
      this.expandedTodoId === todoId ? null : todoId;
    this.cdr.detectChanges();
  }

  isExpanded(todoId: string): boolean {
    return this.expandedTodoId === todoId;
  }

  addSubTask(todo: any) {
    const title =
      (this.newSubTaskTitles[todo.id] || '').trim();
    if (!title) return;

    const sub: SubTask = {
      id: crypto.randomUUID(),
      title,
      isCompleted: false,
      createdAt: new Date().toISOString()
    };

    if (!todo.subTasks) todo.subTasks = [];
    todo.subTasks.push(sub);
    this.newSubTaskTitles[todo.id] = '';
    this.saveSubtaskMap();
    this.cdr.detectChanges();
  }

  toggleSubTask(todo: any, sub: SubTask) {
    sub.isCompleted = !sub.isCompleted;
    this.saveSubtaskMap();
    this.cdr.detectChanges();
  }

  deleteSubTask(
    todo: any, subId: string, event: Event) {
    event.stopPropagation();
    todo.subTasks = todo.subTasks.filter(
      (s: SubTask) => s.id !== subId);
    this.saveSubtaskMap();
    this.cdr.detectChanges();
  }

  getSubTaskProgress(
    todo: any): { done: number; total: number } {
    const subs: SubTask[] = todo.subTasks ?? [];
    return {
      done: subs.filter(s => s.isCompleted).length,
      total: subs.length
    };
  }

  // ─── Drag & Drop ─────────────────────────────

  onDragStart(event: DragEvent, index: number) {
    this.dragIndex = index;
    if (event.dataTransfer)
      event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = index;
  }

  onDragLeave() {
    this.dragOverIndex = null;
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (this.dragIndex === null ||
      this.dragIndex === dropIndex) {
      this.dragIndex = null;
      this.dragOverIndex = null;
      return;
    }

    const dragged = this.filteredTodos[this.dragIndex];
    this.filteredTodos.splice(this.dragIndex, 1);
    this.filteredTodos.splice(dropIndex, 0, dragged);

    const filtered = new Set(
      this.filteredTodos.map(t => t.id));
    const rest = this.todos.filter(
      t => !filtered.has(t.id));
    this.todos = [...this.filteredTodos, ...rest];

    this.dragIndex = null;
    this.dragOverIndex = null;
    this.cdr.detectChanges();
  }

  onDragEnd() {
    this.dragIndex = null;
    this.dragOverIndex = null;
  }

  // ─── Persistence ─────────────────────────────

  private savePriorityMap() {
    const map: Record<string, Priority> = {};
    this.todos.forEach(t => {
      if (t.priority) map[t.id] = t.priority;
    });
    try {
      localStorage.setItem(
        'todo_priorities', JSON.stringify(map));
    } catch (_) {}
  }

  private loadPriorityMap(): Record<string, Priority> {
    try {
      const raw = localStorage.getItem('todo_priorities');
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  private saveSubtaskMap() {
    const map: Record<string, SubTask[]> = {};
    this.todos.forEach(t => {
      if (t.subTasks?.length) map[t.id] = t.subTasks;
    });
    try {
      localStorage.setItem(
        'todo_subtasks', JSON.stringify(map));
    } catch (_) {}
  }

  private loadSubtaskMap(): Record<string, SubTask[]> {
    try {
      const raw = localStorage.getItem('todo_subtasks');
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
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