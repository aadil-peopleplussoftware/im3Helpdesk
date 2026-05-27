import { Component, ChangeDetectorRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './onboarding-wizard.html',
  styleUrls: ['./onboarding-wizard.scss']
})
export class OnboardingWizardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  currentStep = 1;
  loading = false;
  logoPreview = '';
  orgName = '';
  orgLoaded = false;

  step1Form: FormGroup = this.fb.group({
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

  ngOnInit() {
    const step = String(this.route.snapshot.queryParamMap.get('step') || '').toLowerCase();
    if (step === 'mail' || step === 'smtp') {
      this.currentStep = 2;
    }

    this.http.get<any>(`${environment.apiUrl}/Organizations/current`).subscribe({
      next: (org) => {
        this.orgLoaded = true;
        this.orgName = String(org?.name || org?.Name || '');

        const logoUrl = String(org?.logoUrl || '');
        this.logoPreview = logoUrl;

        this.step1Form.patchValue({
          supportEmail: org?.supportEmail || '',
          brandColor: org?.brandColor || '#2563eb',
          logoUrl: logoUrl
        }, { emitEvent: false });

        this.step2Form.patchValue({
          smtpHost: org?.smtpHost || 'smtp.gmail.com',
          smtpPort: org?.smtpPort || 587,
          smtpFromEmail: org?.smtpFromEmail || org?.supportEmail || '',
          smtpFromName: org?.smtpFromName || this.orgName || '',
          smtpUsername: org?.smtpUsername || org?.smtpFromEmail || org?.supportEmail || '',
          imapHost: org?.imapHost || 'imap.gmail.com',
          imapPort: org?.imapPort || 993,
          emailPollingEnabled: org?.emailPollingEnabled !== false
        }, { emitEvent: false });

        this.cdr.detectChanges();
      },
      error: () => {
        this.orgLoaded = true;
        this.cdr.detectChanges();
      }
    });
  }

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
      smtpFromName: this.orgName || 'Support'
    });
    this.currentStep = 2;
  }

  skipMailbox() {
    this.completeOnboarding('You can complete email setup later from Profile');
  }

  finish() {
    if (this.step2Form.invalid) {
      this.step2Form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    const payload = {
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
      payload
    ).subscribe({
      next: () => {
        this.completeOnboarding('Workspace email setup saved');
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

  private completeOnboarding(successMessage: string) {
    this.loading = true;
    this.cdr.detectChanges();

    this.http.post(
      `${environment.apiUrl}/Organizations/current/complete-onboarding`,
      {}
    ).subscribe({
      next: () => {
        this.loading = false;
        this.authService.markFirstLoginComplete();
        this.cdr.detectChanges();
        Promise.resolve().then(() => this.toastr.success(successMessage));
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(err.error?.message || 'Could not complete onboarding')
        );
      }
    });
  }
}