import {
  Component, inject, ChangeDetectorRef, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.scss']
})
export class ResetPasswordComponent implements OnInit {
  private http   = inject(HttpClient);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr    = inject(ChangeDetectorRef);

  token       = '';
  newPassword = '';
  confirmPassword = '';
  showPassword    = false;
  showConfirm     = false;

  loading      = false;
  submitted    = false;
  errorMessage = '';

  ngOnInit() {
    // URL se token lo: /reset-password?token=xxxx
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.token) {
      this.errorMessage = 'Invalid or missing reset token.';
    }
  }

  onSubmit() {
    this.errorMessage = '';

    if (!this.newPassword || this.newPassword.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.http.post(
      `${environment.apiUrl}/Auth/reset-password`,
      { token: this.token, newPassword: this.newPassword }
    ).subscribe({
      next: () => {
        this.loading   = false;
        this.submitted = true;
        this.cdr.detectChanges();
        // 2 sec baad login pe redirect
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (err) => {
        this.loading      = false;
        this.errorMessage =
          err.error?.message || 'Failed to reset password. Link may have expired.';
        this.cdr.detectChanges();
      }
    });
  }
}