import { CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { PublicOnboardingService } from '../public-onboarding.service';

@Component({
  selector: 'app-lead-capture',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './lead-capture.html',
  styleUrls: ['./lead-capture.scss']
})
export class LeadCaptureComponent {
  private fb = inject(FormBuilder);
  private onboardingService = inject(PublicOnboardingService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  loading = false;
  redirecting = false;
  success = false;

  form = this.fb.group({
    organizationName: ['', [Validators.required, Validators.minLength(2)]],
    ownerName: ['', [Validators.required, Validators.minLength(2)]],
    workEmail: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.maxLength(30)]],
    notes: ['', [Validators.maxLength(2000)]]
  });

  submit(): void {
    if (this.redirecting) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    const payload = {
      organizationName: String(this.form.value.organizationName || '').trim(),
      ownerName: String(this.form.value.ownerName || '').trim(),
      workEmail: String(this.form.value.workEmail || '').trim(),
      phone: String(this.form.value.phone || '').trim() || null,
      notes: String(this.form.value.notes || '').trim() || null
    };

    this.onboardingService.submitLead(payload).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        this.form.reset();
        this.cdr.detectChanges();
        this.toastr.success('Request submitted. Redirecting to login...');

        this.redirecting = true;
        this.cdr.detectChanges();
        setTimeout(() => this.router.navigate(['/auth/login']), 600);
      },
      error: (err) => {
        this.loading = false;
        this.redirecting = false;
        this.cdr.detectChanges();
        this.toastr.error(err.error?.message || 'Unable to submit request.');
      }
    });
  }
}