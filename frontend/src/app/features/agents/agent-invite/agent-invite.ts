import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { AgentService } from '../../../core/services/agent';
import { AgentGroupService } from '../../../core/services/agent-group';
import { LayoutComponent } from '../../../layouts/main-layout/layout';

@Component({
  selector: 'app-agent-invite',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule,
    MatProgressSpinnerModule, LayoutComponent
  ],
  templateUrl: './agent-invite.html',
  styleUrls: ['./agent-invite.scss']
})
export class AgentInviteComponent {
  private agentService = inject(AgentService);
  private groupService = inject(AgentGroupService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  uploading = false;
  groups: any[] = [];
  selectedGroups: string[] = [];
  photoPreview = '';
  inviteSuccess = false;
  invitedTempPassword = '';

  roles = [
    { value: 'Administrator', label: 'Administrator' },
    { value: 'Agent', label: 'Agent' }
  ];

  form: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
    role: ['Agent', Validators.required],
    signature: [''],
    photoUrl: ['']
  });

  constructor() {
    this.groupService.getAll().subscribe({
      next: (data) => {
        this.groups = data;
        this.cdr.detectChanges();
      }
    });
  }

  toggleGroup(groupId: string) {
    const idx = this.selectedGroups.indexOf(groupId);
    if (idx > -1) {
      this.selectedGroups.splice(idx, 1);
    } else {
      this.selectedGroups.push(groupId);
    }
  }

  isGroupSelected(groupId: string): boolean {
    return this.selectedGroups.includes(groupId);
  }

  onPhotoSelect(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.photoPreview = e.target.result;
      this.form.patchValue({ photoUrl: e.target.result });
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

    copyPassword() {
      navigator.clipboard.writeText(this.invitedTempPassword);
      Promise.resolve().then(() =>
        this.toastr.success('Password copied!')
      );
    }

  onSubmit() {
  if (this.form.invalid) return;
  this.loading = true;
  this.cdr.detectChanges();

  const payload = {
    fullName: this.form.value.fullName,
    email: this.form.value.email,
    phoneNumber: this.form.value.phoneNumber || '',
    role: this.form.value.role,
    signature: this.form.value.signature || '',
    photoUrl: this.form.value.photoUrl || '',
    // ✅ groupIds as string array — backend Guid.Parse karega
    groupIds: this.selectedGroups
  };

  this.agentService.invite(payload).subscribe({
    next: (res: any) => {
      this.loading = false;
      this.invitedTempPassword = res.tempPassword;
      this.inviteSuccess = true;
      this.cdr.detectChanges();
    },
    error: (err: any) => {
      this.loading = false;
      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.error(err.error?.message || 'Failed')
      );
    }
  });
}
}