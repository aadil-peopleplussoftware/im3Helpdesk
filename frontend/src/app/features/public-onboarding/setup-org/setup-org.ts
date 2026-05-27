import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { PublicOnboardingService } from '../public-onboarding.service';
import { AuthService } from '../../auth/auth.service';

function passwordMatchValidator(group: AbstractControl) {
  const password = String(group.get('password')?.value ?? '');
  const confirmPassword = String(group.get('confirmPassword')?.value ?? '');
  if (!password || !confirmPassword) return null;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-setup-org',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './setup-org.html',
  styleUrls: ['./setup-org.scss']
})
export class SetupOrgComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private onboardingService = inject(PublicOnboardingService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  saving = false;
  redirecting = false;
  token = '';

  form = this.fb.group(
    {
      organizationName: [{ value: '', disabled: true }],
      workEmail: [{ value: '', disabled: true }],
      ownerName: [{ value: '', disabled: true }],
      password: ['', [Validators.required, Validators.minLength(10)]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordMatchValidator }
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.router.navigate(['/setup-org-error']);
      return;
    }

    this.onboardingService.verifyToken(this.token).subscribe({
      next: (res: any) => {
        this.form.patchValue({
          organizationName: res.organizationName,
          workEmail: res.workEmail,
          ownerName: res.ownerName
        });
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => this.router.navigate(['/setup-org-error'])
    });
  }

  submit(): void {
    if (this.redirecting) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.error('Please fix the highlighted fields and try again.');
      return;
    }

    const password = String(this.form.value.password || '');
    const confirmPassword = String(this.form.value.confirmPassword || '');

    this.saving = true;
    this.cdr.detectChanges();

    this.onboardingService.registerOrganization({
      token: this.token,
      password,
      confirmPassword
    }).subscribe({
      next: (res: any) => {
        if (res?.token) {
          // Auto-login so we can immediately continue to authenticated onboarding.
          this.authService.saveUserData(res);
        }

        this.toastr.success('Organization created. Starting onboarding...');
        this.redirecting = true;
        this.cdr.detectChanges();
        setTimeout(() => {
          this.saving = false;
          this.cdr.detectChanges();
          this.router.navigate(['/onboarding'], { queryParams: { step: 'mail' } });
        }, 600);
      },
      error: (err) => {
        this.saving = false;
        this.redirecting = false;
        this.cdr.detectChanges();
        this.toastr.error(err.error?.message || 'Registration failed.');
      }
    });
  }
}