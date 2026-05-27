import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
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
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    LayoutComponent
  ],
  templateUrl: './profile-page.html',
  styleUrls: ['./profile-page.scss']
})
export class ProfilePageComponent implements OnInit {
  private static readonly PROFILE_FIELDS = [
    'fullName',
    'email',
    'phoneNumber',
    'department',
    'location',
    'designation',
    'dateOfBirth',
    'dateOfJoining',
    'gender',
    'photoUrl'
  ] as const;

  private static readonly PROFILE_FIELD_LABELS: Record<string, string> = {
    fullName: 'Full Name',
    email: 'Email',
    phoneNumber: 'Phone Number',
    department: 'Department / Team',
    location: 'Location / Branch',
    designation: 'Designation / Role',
    dateOfBirth: 'Date of Birth',
    dateOfJoining: 'Date of Joining',
    gender: 'Gender',
    photoUrl: 'Avatar'
  };

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  isCompanyAdmin = false;
  smtpSetupChecked = false;
  smtpSetupIncomplete = false;

  loadingProfile = true;
  savingProfile = false;
  isEditMode = false;

  emailNotifications = true;
  smsAlerts = false;

  showPasswordForm = false;
  changingPassword = false;
  currentPasswordCtrl = new FormControl('', Validators.required);
  newPasswordCtrl = new FormControl('', [Validators.required, Validators.minLength(6)]);
  confirmPasswordCtrl = new FormControl('', Validators.required);

  photoUrl = '';
  photoPreview = '';

  profileCompletion = 0;
  completionTone: 'red' | 'orange' | 'blue' | 'green' = 'red';
  completionMessage = 'Profile incomplete';
  missingFields: string[] = [];

  accountInfo: {
    userName: string;
    role: string;
    status: string;
    createdAt: string | null;
    lastLoginAt: string | null;
  } = {
    userName: '-',
    role: '-',
    status: 'Inactive',
    createdAt: null,
    lastLoginAt: null
  };

  profileForm: FormGroup = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.maxLength(30)]],
    department: ['', [Validators.maxLength(120)]],
    location: ['', [Validators.maxLength(120)]],
    designation: ['', [Validators.maxLength(120)]],
    dateOfBirth: [''],
    dateOfJoining: [''],
    gender: ['', [Validators.maxLength(30)]],
    photoUrl: ['']
  });

  genderOptions = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

  ngOnInit() {
    this.isCompanyAdmin = this.authService.getUserRole() === 'CompanyAdmin';
    this.profileForm.disable({ emitEvent: false });
    this.loadProfile();
    if (this.isCompanyAdmin) this.loadMailboxSetupStatus();
    this.profileForm.valueChanges.subscribe(() => {
      this.refreshCompletion();
      this.cdr.detectChanges();
    });
  }

  private loadMailboxSetupStatus() {
    this.http.get<any>(`${environment.apiUrl}/Organizations/current`).subscribe({
      next: (org) => {
        const smtpPasswordSet = Boolean(org?.smtpPasswordSet);
        const complete = Boolean(
          org?.smtpHost &&
          org?.smtpPort &&
          org?.smtpFromEmail &&
          org?.smtpUsername &&
          smtpPasswordSet &&
          org?.imapHost &&
          org?.imapPort
        );
        this.smtpSetupIncomplete = !complete;
        this.smtpSetupChecked = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.smtpSetupChecked = true;
        this.cdr.detectChanges();
      }
    });
  }

  goToMailboxOnboarding() {
    this.router.navigate(['/onboarding']);
  }

  loadProfile() {
    this.http.get<any>(`${environment.apiUrl}/Profile`).subscribe({
      next: (data) => {
        this.profileForm.patchValue({
          fullName: data.fullName ?? '',
          email: data.email ?? '',
          phoneNumber: data.phoneNumber ?? '',
          department: data.department ?? '',
          location: data.location ?? '',
          designation: data.designation ?? '',
          dateOfBirth: this.toDateInputValue(data.dateOfBirth),
          dateOfJoining: this.toDateInputValue(data.dateOfJoining),
          gender: data.gender ?? '',
          photoUrl: data.photoUrl ?? ''
        }, { emitEvent: false });

        if (data.photoUrl) {
          this.photoUrl = environment.baseUrl + data.photoUrl;
          localStorage.setItem('im3_photo', data.photoUrl);
        }

        this.accountInfo = {
          userName: data.userName || (data.email ? String(data.email).split('@')[0] : '-'),
          role: data.role || '-',
          status: data.isActive ? 'Active' : 'Inactive',
          createdAt: data.createdAt ?? null,
          lastLoginAt: data.lastLoginAt ?? null
        };

        this.refreshCompletion();
        this.loadingProfile = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingProfile = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error('Failed to load profile')
        );
      }
    });
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.profileForm.enable({ emitEvent: false });
      this.profileForm.controls['email'].disable({ emitEvent: false });
    } else {
      this.profileForm.disable({ emitEvent: false });
      this.loadProfile();
    }
    this.cdr.detectChanges();
  }

  onPhotoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.photoPreview = String(e.target?.result ?? '');
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('file', file);

    this.http.post<any>(
      `${environment.apiUrl}/Profile/upload-photo`,
      formData
    ).subscribe({
      next: (res) => {
        this.photoUrl = environment.baseUrl + res.photoUrl;
        this.photoPreview = '';
        localStorage.setItem('im3_photo', res.photoUrl);
        this.profileForm.patchValue({ photoUrl: res.photoUrl });
        this.refreshCompletion();
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Photo updated!')
        );
      },
      error: (err) => {
        this.photoPreview = '';
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(err.error?.message || 'Photo upload failed')
        );
      }
    });
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308',
      '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    const idx = (name?.charCodeAt(0) || 0) % colors.length;
    return colors[idx];
  }

  saveProfile() {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) return;

    const dob = this.profileForm.value.dateOfBirth;
    const doj = this.profileForm.value.dateOfJoining;
    if (dob && doj && new Date(doj) < new Date(dob)) {
      Promise.resolve().then(() =>
        this.toastr.error('Date of joining cannot be before date of birth')
      );
      return;
    }

    const payload = {
      fullName: this.profileForm.value.fullName,
      phoneNumber: this.valueOrNull(this.profileForm.value.phoneNumber),
      department: this.valueOrNull(this.profileForm.value.department),
      location: this.valueOrNull(this.profileForm.value.location),
      designation: this.valueOrNull(this.profileForm.value.designation),
      dateOfBirth: this.valueOrNull(this.profileForm.value.dateOfBirth),
      dateOfJoining: this.valueOrNull(this.profileForm.value.dateOfJoining),
      gender: this.valueOrNull(this.profileForm.value.gender)
    };

    this.savingProfile = true;
    this.cdr.detectChanges();

    this.http.put(`${environment.apiUrl}/Profile`, payload).subscribe({
      next: () => {
        this.savingProfile = false;
        this.isEditMode = false;
        this.profileForm.disable({ emitEvent: false });
        this.refreshCompletion();
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Profile updated!')
        );
      },
      error: (err) => {
        this.savingProfile = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.error(err.error?.message || 'Failed to update profile')
        );
      }
    });
  }

  get completionBarClass() {
    return `tone-${this.completionTone}`;
  }

  get completionTooltipText() {
    if (!this.missingFields.length) {
      return 'All profile fields are completed.';
    }
    return `Missing: ${this.missingFields.join(', ')}`;
  }

  togglePasswordForm() {
    this.showPasswordForm = !this.showPasswordForm;
    if (!this.showPasswordForm) {
      this.currentPasswordCtrl.reset();
      this.newPasswordCtrl.reset();
      this.confirmPasswordCtrl.reset();
    }
  }

  changePassword() {
    this.currentPasswordCtrl.markAsTouched();
    this.newPasswordCtrl.markAsTouched();
    this.confirmPasswordCtrl.markAsTouched();

    if (this.currentPasswordCtrl.invalid || this.newPasswordCtrl.invalid || this.confirmPasswordCtrl.invalid) return;

    if (this.newPasswordCtrl.value !== this.confirmPasswordCtrl.value) {
      Promise.resolve().then(() => this.toastr.error('New passwords do not match'));
      return;
    }

    this.changingPassword = true;
    this.cdr.detectChanges();

    this.http.put(`${environment.apiUrl}/Profile/change-password`, {
      currentPassword: this.currentPasswordCtrl.value,
      newPassword: this.newPasswordCtrl.value,
      confirmNewPassword: this.confirmPasswordCtrl.value
    }).subscribe({
      next: () => {
        this.changingPassword = false;
        this.showPasswordForm = false;
        this.currentPasswordCtrl.reset();
        this.newPasswordCtrl.reset();
        this.confirmPasswordCtrl.reset();
        this.cdr.detectChanges();
        Promise.resolve().then(() => this.toastr.success('Password updated successfully!'));
      },
      error: (err) => {
        this.changingPassword = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() => this.toastr.error(err.error?.message || 'Failed to change password'));
      }
    });
  }

  private refreshCompletion() {
    const value = this.profileForm.getRawValue();
    const filled = ProfilePageComponent.PROFILE_FIELDS.filter((field) => {
      const fieldValue = value[field];
      return typeof fieldValue === 'string'
        ? fieldValue.trim().length > 0
        : Boolean(fieldValue);
    }).length;

    const total = ProfilePageComponent.PROFILE_FIELDS.length;
    this.profileCompletion = Math.round((filled / total) * 100);

    const missing = ProfilePageComponent.PROFILE_FIELDS.filter((field) => {
      const fieldValue = value[field];
      return typeof fieldValue === 'string'
        ? fieldValue.trim().length === 0
        : !fieldValue;
    });
    this.missingFields = missing.map((field) =>
      ProfilePageComponent.PROFILE_FIELD_LABELS[field]
    );

    if (this.profileCompletion <= 40) {
      this.completionTone = 'red';
      this.completionMessage = 'Profile incomplete';
      return;
    }

    if (this.profileCompletion <= 75) {
      this.completionTone = 'orange';
      this.completionMessage = 'Almost there!';
      return;
    }

    if (this.profileCompletion < 100) {
      this.completionTone = 'blue';
      this.completionMessage = 'Looking good!';
      return;
    }

    this.completionTone = 'green';
    this.completionMessage = 'Profile perfectly completed!';
  }

  private toDateInputValue(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private valueOrNull(value: string | null | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  getInitials(name: string): string {
    if (!name?.trim()) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  clearField(field: string): void {
    this.profileForm.get(field)?.setValue('');
  }

  openSecuritySettings(): void {
    this.showPasswordForm = !this.showPasswordForm;
    if (!this.showPasswordForm) {
      this.currentPasswordCtrl.reset();
      this.newPasswordCtrl.reset();
      this.confirmPasswordCtrl.reset();
    }
  }

  logout() {
    this.authService.logout();
  }
}
