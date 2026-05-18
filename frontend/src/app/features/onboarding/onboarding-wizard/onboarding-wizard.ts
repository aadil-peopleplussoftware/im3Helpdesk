import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIconModule } from '@angular/material/icon';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatButtonModule, MatFormFieldModule,
    MatInputModule, MatStepperModule, MatIconModule
  ],
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

  loading = false;
  logoPreview = '';

  step1Form: FormGroup = this.fb.group({
    companyName: ['', Validators.required],
    supportEmail: ['', [Validators.required, Validators.email]],
    brandColor: ['#2563eb'],
    logoUrl: ['']
  });

  step2Form: FormGroup = this.fb.group({
    agentEmail1: ['', Validators.email],
    agentEmail2: ['', Validators.email],
    agentEmail3: ['', Validators.email]
  });

  agentEmails: string[] = [];
  newAgentEmail = '';

  addAgentEmail() {
    const email = this.newAgentEmail.trim();
    if (email && !this.agentEmails.includes(email)) {
      this.agentEmails.push(email);
      this.newAgentEmail = '';
      this.cdr.detectChanges();
    }
  }

  removeAgent(email: string) {
    this.agentEmails = this.agentEmails.filter(e => e !== email);
    this.cdr.detectChanges();
  }

  onLogoSelect(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.logoPreview = e.target.result;
      this.step1Form.patchValue({ logoUrl: e.target.result });
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  submitOnboarding() {
    this.loading = true;
    this.cdr.detectChanges();

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });

    const payload = {
      name: this.step1Form.value.companyName,
      supportEmail: this.step1Form.value.supportEmail || '',
      brandColor: this.step1Form.value.brandColor || '#2563eb',
      logoUrl: this.step1Form.value.logoUrl || ''
    };

    this.http.put(
      `${environment.apiUrl}/Organizations/current`,
      payload, { headers }
    ).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Setup complete! Welcome!')
        );
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.router.navigate(['/dashboard']);
      }
    });
  }

  finish() {
    this.submitOnboarding();
  }
}