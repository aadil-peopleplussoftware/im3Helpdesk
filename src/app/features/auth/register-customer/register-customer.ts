import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-register-customer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register-customer.html',
  styleUrls: ['./register-customer.scss']
})
export class RegisterCustomerComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  success = false;
  errorMessage = '';

  form: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    organizationSlug: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  }, { validators: this.passwordMatchValidator });

  passwordMatchValidator(control: AbstractControl) {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    if (password !== confirmPassword) {
      control.get('confirmPassword')?.setErrors({ mismatch: true });
      return { mismatch: true };
    }
    return null;
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.http.post(
      'https://localhost:7071/api/Auth/register-customer',
      this.form.value
    ).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.error?.message || 'Registration failed. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }
}