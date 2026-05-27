import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule,
  FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';
import { TicketMasterOption, TicketMasterService } from '../../../core/services/ticket-master';

@Component({
  selector: 'app-customer-portal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ReactiveFormsModule, RouterModule,
    LayoutComponent
  ],
  templateUrl: './customer-portal.html',
  styleUrls: ['./customer-portal.scss']
})
export class CustomerPortalComponent
  implements OnInit {

  private http = inject(HttpClient);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ticketMasterService = inject(TicketMasterService);

  myTickets: any[] = [];
  loading = true;
  showCreateForm = false;
  creating = false;

  createForm: FormGroup = this.fb.group({
    title: ['', [Validators.required,
      Validators.minLength(5)]],
    description: ['', [Validators.required,
      Validators.minLength(10)]],
    priority: ['Medium'],
    category: ['General']
  });

  priorities: TicketMasterOption[] = [];
  categories = [
    'General', 'Technical', 'Billing', 'Account'
  ];

  ngOnInit() {
    this.loadMasterOptions();
    this.loadMyTickets();
  }

  loadMasterOptions() {
    this.ticketMasterService.getAll(true).subscribe({
      next: (data) => {
        this.priorities = data.ticketPriorities || [];
        this.createForm.patchValue({
          priority: this.priorities[0]?.value || 'Medium'
        });
        this.cdr.detectChanges();
      }
    });
  }

  loadMyTickets() {
    this.loading = true;
    this.http.get<any[]>(`${environment.apiUrl}/Customer/my-tickets`).subscribe({
      next: (data) => {
        this.myTickets = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  createTicket() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.creating = true;
    this.cdr.detectChanges();

    this.http.post<any>(
      `${environment.apiUrl}/Customer` +
      '/submit-ticket',
      this.createForm.value
    ).subscribe({
      next: (res) => {
        this.creating = false;
        this.showCreateForm = false;
        this.createForm.reset({
          priority: 'Medium',
          category: 'General'
        });
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Ticket submitted!')
        );
        this.loadMyTickets();
      },
      error: (err) => {
        this.creating = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(
            err.error?.message || 'Failed')
        );
      }
    });
  }

  getStatusColor(s: string): string {
    const c: any = {
      'Open': '#22c55e', 'InProgress': '#f59e0b',
      'Resolved': '#8b5cf6', 'Closed': '#6b7280'
    };
    return c[s] || '#6b7280';
  }
}