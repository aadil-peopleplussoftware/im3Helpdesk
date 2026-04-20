import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  showPassword = false;
  errorMessage = '';
  successMessage = '';

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService.login(this.form.value).subscribe({
      next: (res: any) => {
        this.authService.saveUserData(res);
        this.loading = false;
        this.cdr.detectChanges();
        if (res.isFirstLogin && res.user?.role === 'CompanyAdmin') {
          this.router.navigate(['/onboarding']);
        } else if (res.user?.role === 'SuperAdmin') {
          this.router.navigate(['/admin']);
        } else if (res.user?.role === 'Customer') {
          this.router.navigate(['/customer']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.status === 401
            ? 'Invalid email or password'
            : err.status === 403
              ? 'Account is locked. Contact admin.'
              : err.error?.message
                || 'Login failed. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }
}