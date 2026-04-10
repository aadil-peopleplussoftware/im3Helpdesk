import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from '../../../services/customer';
import { AuthService } from '../../../services/auth.service';
import { Subject, interval, takeUntil } from 'rxjs';

@Component({
  selector: 'app-customer-ticket-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatButtonModule, MatToolbarModule, MatCardModule,
    MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatDividerModule
  ],
  templateUrl: './customer-ticket-detail.html',
  styleUrls: ['./customer-ticket-detail.scss']
})
export class CustomerTicketDetailComponent implements OnInit, OnDestroy {
  private customerService = inject(CustomerService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  ticket: any = null;
  loading = true;
  sending = false;
  replyText = '';
  ticketId = '';

  ngOnInit() {
    this.ticketId = this.route.snapshot.paramMap.get('id') || '';
    this.loadTicket();

    interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadTicket());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTicket() {
    this.customerService.getMyTicket(this.ticketId).subscribe({
      next: (data: any) => {
        this.ticket = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

sendReply() {
    if (!this.replyText.trim()) return;
    this.sending = true;
    this.cdr.detectChanges();

    this.customerService.addReply(this.ticketId, this.replyText).subscribe({
      next: () => {
        this.replyText = '';
        this.sending = false;  
        this.cdr.detectChanges(); 
        this.toastr.success('Reply sent!');
        this.loadTicket();
      },
      error: () => {
        this.sending = false;
        this.toastr.error('Failed to send reply');
        this.cdr.detectChanges();
      }
    });
  }

  getStatusColor(status: string): string {
    const colors: any = {
      'Open': '#f44336', 'InProgress': '#ff9800',
      'Resolved': '#4caf50', 'Closed': '#9e9e9e'
    };
    return colors[status] || '#666';
  }

  logout() {
    this.authService.logout();
  }
}