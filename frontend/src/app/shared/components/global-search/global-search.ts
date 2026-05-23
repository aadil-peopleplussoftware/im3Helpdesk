import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule
  ],
  templateUrl: './global-search.html',
  styleUrls: ['./global-search.scss']
})
export class GlobalSearchComponent {
  private http = inject(HttpClient);
  public router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  searchQuery = '';
  results: any = null;
  showResults = false;
  private searchSubject = new Subject<string>();

  constructor() {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2) return [];
        return this.http.get<any>(`${environment.apiUrl}/Search?q=${q}`);
      })
    ).subscribe({
      next: (data) => {
        this.results = data;
        this.showResults = true;
        this.cdr.detectChanges();
      }
    });
  }

  onSearch() {
    this.searchSubject.next(this.searchQuery);
    if (!this.searchQuery.trim()) {
      this.results = null;
      this.showResults = false;
    }
  }

  navigate(type: string, id: string) {
    this.showResults = false;
    this.searchQuery = '';
    this.results = null;

    if (type === 'ticket') this.router.navigate(['/tickets', id]);
    else if (type === 'article') this.router.navigate(['/kb', id]);
    this.cdr.detectChanges();
  }

  get hasResults(): boolean {
    return this.results && (
      this.results.tickets?.length > 0 ||
      this.results.agents?.length > 0 ||
      this.results.articles?.length > 0
    );
  }

  closeResults() {
    setTimeout(() => {
      this.showResults = false;
      this.cdr.detectChanges();
    }, 200);
  }
}