import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ToastrService } from 'ngx-toastr';
import { TicketService } from '../../../services/ticket';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatFormFieldModule, MatInputModule,
    MatButtonModule, MatSelectModule,
    MatProgressSpinnerModule, MatToolbarModule
  ],
  templateUrl: './ticket-create.html',
  styleUrls: ['./ticket-create.scss']
})
export class TicketCreateComponent {
  loading = false;
  form: FormGroup;

  categories = ['General', 'Technical', 'Billing', 'Sales', 'Network', 'Hardware'];
  priorities = ['Low', 'Medium', 'High', 'Critical'];

  constructor(
    private fb: FormBuilder,
    private ticketService: TicketService,
    public router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(5)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      category: ['General', Validators.required],
      priority: ['Medium', Validators.required]
    });
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.cdr.detectChanges();

    this.ticketService.create(this.form.value).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.toastr.success('Ticket created successfully!');
        this.router.navigate(['/tickets']);
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.toastr.error(err.error?.message || 'Failed to create ticket');
      }
    });
  }
}