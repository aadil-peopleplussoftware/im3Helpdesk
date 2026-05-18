import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.scss']
})
export class ForgotPasswordComponent {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  email = '';
  loading = false;
  submitted = false;
  errorMessage = '';
  successMessage = '';

  onSubmit() {
    if (!this.email?.trim()) {
      this.errorMessage = 'Email is required';
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.http.post(
      `${environment.apiUrl}/Auth/forgot-password`,
      { email: this.email }
    ).subscribe({
      next: () => {
        this.loading = false;
        this.submitted = true;
        this.successMessage =
          'Password reset email sent! Check your inbox.';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.error?.message
            || 'Email not found. Please check and try again.';
        this.cdr.detectChanges();
      }
    });
  }
}