import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';

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

  ngOnInit() {
    this.loadLogs();
  }

loadLogs() {
  this.loading = true;

  let url = `${environment.apiUrl}/Audit?page=${this.page}&pageSize=${this.pageSize}`;
  if (this.selectedType) {
    url += `&entityType=${this.selectedType}`;
  }

  this.http.get<any>(url).subscribe({
    next: (res) => {
      this.logs = res.logs;
      this.total = res.total;
      this.totalPages = res.totalPages;
      this.loading = false;
      this.cdr.detectChanges();
    },
    error: (err) => {
      this.toastr.error('Failed to load audit logs');
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