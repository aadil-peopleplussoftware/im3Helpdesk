import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register-customer',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './register-customer.html',
  styleUrls: ['./register-customer.scss']
})
export class RegisterCustomerComponent {
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  success = false;
  orgSlug = this.route.snapshot.queryParamMap.get('org') || '';

  form: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required],
    organizationSlug: [this.orgSlug, Validators.required]
  }, { validators: this.passwordMatchValidator });

  passwordMatchValidator(control: AbstractControl) {
    const p = control.get('password')?.value;
    const cp = control.get('confirmPassword')?.value;
    if (p !== cp) {
      control.get('confirmPassword')?.setErrors({ mismatch: true });
      return { mismatch: true };
    }
    return null;
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.cdr.detectChanges();

    this.authService.registerCustomer(this.form.value).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.cdr.detectChanges();
        this.toastr.success('Account created! Please verify your email.');
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err: any) => {
        this.loading = false;
        this.cdr.detectChanges();
        this.toastr.error(err.error?.message || 'Registration failed');
      }
    });
  }
}