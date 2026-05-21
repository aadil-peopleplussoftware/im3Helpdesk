import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './onboarding-wizard.html',
  styleUrls: ['./onboarding-wizard.scss']
})
export class OnboardingWizardComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  currentStep = 1;
  loading = false;
  logoPreview = '';

  step1Form: FormGroup = this.fb.group({
    companyName: ['', Validators.required],
    supportEmail: ['', [Validators.required, Validators.email]],
    brandColor: ['#2563eb'],
    logoUrl: ['']
  });

  step2Form: FormGroup = this.fb.group({
    smtpHost: ['smtp.gmail.com', Validators.required],
    smtpPort: [587, [Validators.required, Validators.min(1)]],
    smtpFromEmail: ['', [Validators.required, Validators.email]],
    smtpFromName: [''],
    smtpUsername: ['', [Validators.required, Validators.email]],
    smtpPassword: ['', Validators.required],
    imapHost: ['imap.gmail.com', Validators.required],
    imapPort: [993, [Validators.required, Validators.min(1)]],
    emailPollingEnabled: [true]
  });

  onLogoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const result = String(e.target?.result || '');
      this.logoPreview = result;
      this.step1Form.patchValue({ logoUrl: result });
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  goToMailStep() {
    if (this.step1Form.invalid) {
      this.step1Form.markAllAsTouched();
      return;
    }

    const supportEmail = this.step1Form.value.supportEmail || '';
    this.step2Form.patchValue({
      smtpFromEmail: supportEmail,
      smtpUsername: supportEmail,
      smtpFromName: this.step1Form.value.companyName || 'Support'
    });
    this.currentStep = 2;
  }

  finish() {
    if (this.step2Form.invalid) {
      this.step2Form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    const payload = {
      name: this.step1Form.value.companyName,
      supportEmail: this.step1Form.value.supportEmail,
      brandColor: this.step1Form.value.brandColor || '#2563eb',
      logoUrl: this.step1Form.value.logoUrl || '',
      smtpHost: this.step2Form.value.smtpHost,
      smtpPort: Number(this.step2Form.value.smtpPort),
      smtpFromEmail: this.step2Form.value.smtpFromEmail,
      smtpFromName: this.step2Form.value.smtpFromName || 'Support',
      smtpUsername: this.step2Form.value.smtpUsername,
      smtpPassword: this.step2Form.value.smtpPassword,
      imapHost: this.step2Form.value.imapHost,
      imapPort: Number(this.step2Form.value.imapPort),
      emailPollingEnabled: this.step2Form.value.emailPollingEnabled === true
    };

    this.http.put(
      `${environment.apiUrl}/Organizations/current`,
      payload,
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Workspace email setup saved')
        );
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(err.error?.message || 'Setup failed')
        );
      }
    });
  }

  private getHeaders() {
    return new HttpHeaders({
      Authorization: `Bearer ${this.authService.getToken()}`
    });
  }
}