import {
  Component, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from '../../../core/services/customer';
import { AuthService } from '../../auth/auth.service';
import { Subject, interval, takeUntil } from 'rxjs';

@Component({
  selector: 'app-customer-ticket-detail',
  standalone: true,
  // ✅ No Material imports — pure HTML/CSS
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './customer-ticket-detail.html',
  styleUrls: ['./customer-ticket-detail.scss']
})
export class CustomerTicketDetailComponent
  implements OnInit, OnDestroy {

  private customerService = inject(CustomerService);
  private authService     = inject(AuthService);
  private route           = inject(ActivatedRoute);
  public  router          = inject(Router);
  private toastr          = inject(ToastrService);
  private cdr             = inject(ChangeDetectorRef);
  private destroy$        = new Subject<void>();

  ticket:    any    = null;
  loading:   boolean = true;
  sending:   boolean = false;
  replyText: string  = '';
  ticketId:  string  = '';

  ngOnInit() {
    this.ticketId =
      this.route.snapshot.paramMap.get('id') ?? '';
    this.loadTicket();

    // Auto-refresh every 15s
    interval(15000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadTicket());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTicket() {
    this.customerService
      .getMyTicket(this.ticketId)
      .subscribe({
        next: (data: any) => {
          this.ticket  = data;
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

    this.customerService
      .addReply(this.ticketId, this.replyText)
      .subscribe({
        next: () => {
          this.replyText = '';
          this.sending   = false;
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
    const colors: Record<string, string> = {
      'Open':       '#22c55e',
      'InProgress': '#f59e0b',
      'Resolved':   '#8b5cf6',
      'Closed':     '#9e9e9e'
    };
    return colors[status] ?? '#9e9e9e';
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}