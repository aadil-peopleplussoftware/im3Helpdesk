import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    FormsModule, RouterModule, LayoutComponent
  ],
  templateUrl: './profile-page.html',
  styleUrls: ['./profile-page.scss']
})
export class ProfilePageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  savingProfile = false;
  savingPassword = false;
  savingOrg = false;

  photoUrl = '';
  photoPreview = '';

  profileForm: FormGroup = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['']
  });

  passwordForm: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  });

  orgForm: FormGroup = this.fb.group({
    name: [''],
    supportEmail: [''],
    brandColor: ['#2563eb'],
    logoUrl: ['']
  });

  ngOnInit() {
    this.loadProfile();
    this.loadOrg();
  }

  loadProfile() {
    this.http.get<any>(`${environment.apiUrl}/Profile`).subscribe({
      next: (data) => {
        this.profileForm.patchValue(data);
        if (data.photoUrl) {
          this.photoUrl = environment.baseUrl + data.photoUrl;
          localStorage.setItem('im3_photo', data.photoUrl);
        }
        this.cdr.detectChanges();
      }
    });
  }

  loadOrg() {
    this.http.get<any>(`${environment.apiUrl}/Organizations/current`).subscribe({
      next: (data) => {
        this.orgForm.patchValue(data);
        this.cdr.detectChanges();
      }
    });
  }

onPhotoSelect(event: any) {
  const file = event.target.files[0];
  if (!file) return;

  // Show preview instantly
  const reader = new FileReader();
  reader.onload = (e: any) => {
    this.photoPreview = e.target.result;
    this.cdr.detectChanges();
  };
  reader.readAsDataURL(file);

  // Upload to server
  const formData = new FormData();
  formData.append('file', file);

  this.http.post<any>(
    `${environment.apiUrl}/Profile/upload-photo`,
    formData
  ).subscribe({
    next: (res) => {
      const fullUrl =
        environment.baseUrl + res.photoUrl;
      this.photoUrl = fullUrl;
      this.photoPreview = '';

      // ✅ Save to localStorage
      localStorage.setItem('im3_photo', res.photoUrl);

      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.success('Photo updated!')
      );
    },
    error: (err) => {
      this.photoPreview = '';
      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.error(
          err.error?.message || 'Photo upload failed')
      );
    }
  });
}

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#eab308',
      '#22c55e','#3b82f6','#8b5cf6','#ec4899'
    ];
    const idx = (name?.charCodeAt(0) || 0) % colors.length;
    return colors[idx];
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.savingProfile = true;
    this.cdr.detectChanges();

    this.http.put(
      `${environment.apiUrl}/Profile`,
      this.profileForm.value
    ).subscribe({
      next: () => {
        this.savingProfile = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Profile updated!')
        );
      },
      error: () => {
        this.savingProfile = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error('Failed to update profile')
        );
      }
    });
  }

  savePassword() {
    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) {
      Promise.resolve().then(() =>
        this.toastr.error('Passwords do not match')
      );
      return;
    }
    if (this.passwordForm.invalid) return;
    this.savingPassword = true;
    this.cdr.detectChanges();

    this.http.put(
      `${environment.apiUrl}/Profile/change-password`,
      this.passwordForm.value
    ).subscribe({
      next: () => {
        this.savingPassword = false;
        this.passwordForm.reset();
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Password changed!')
        );
      },
      error: (err) => {
        this.savingPassword = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(err.error?.message || 'Failed')
        );
      }
    });
  }

  saveOrg() {
    this.savingOrg = true;
    this.cdr.detectChanges();

    this.http.put(
      `${environment.apiUrl}/Organizations/current`,
      this.orgForm.value
    ).subscribe({
      next: () => {
        this.savingOrg = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Organization updated!')
        );
      },
      error: () => {
        this.savingOrg = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error('Failed')
        );
      }
    });
  }

  logout() {
    this.authService.logout();
  }
}