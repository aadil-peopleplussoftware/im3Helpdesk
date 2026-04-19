import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatProgressSpinnerModule, MatSelectModule,
    MatFormFieldModule
  ],
  templateUrl: './audit-log.html',
  styleUrls: ['./audit-log.scss']
})
export class AuditLogComponent implements OnInit {
  @Input() embedded = false;

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  logs: any[] = [];
  loading = true;
  page = 1;
  pageSize = 20;
  total = 0;
  totalPages = 0;
  selectedType = '';
  entityTypes = ['', 'Ticket', 'Agent', 'Profile'];

  private getHeaders() {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    this.loadLogs();
  }


  loadLogs() {
    this.loading = true;
    const params = new URLSearchParams();
    params.set('page', this.page.toString());
    params.set('pageSize', this.pageSize.toString());
    if (this.selectedType)
      params.set('entityType', this.selectedType);

    // ✅ /api/Audit — NOT /api/Notifications/activity
    this.http.get<any>(
      `https://localhost:7071/api/Audit?${params}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.logs = data.logs || [];
        this.total = data.total || 0;
        this.totalPages = data.totalPages || 0;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  prevPage() {
    if (this.page > 1) { this.page--; this.loadLogs(); }
  }

  nextPage() {
    if (this.page < this.totalPages) { this.page++; this.loadLogs(); }
  }

  getActionColor(action: string): string {
    const colors: any = {
      'Created': '#22c55e', 'StatusChanged': '#f59e0b',
      'Commented': '#8b5cf6', 'Invited': '#3b82f6',
      'Updated': '#06b6d4', 'BulkUpdate': '#f97316',
      'Assigned': '#6366f1', 'Deleted': '#ef4444',
      'TimeLogged': '#14b8a6'
    };
    return colors[action] || '#6b7280';
  }
}