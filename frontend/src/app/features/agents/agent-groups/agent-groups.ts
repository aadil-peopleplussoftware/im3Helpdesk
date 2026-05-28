import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms'; // 👈 FormsModule yahan add kiya
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { ToastrService } from 'ngx-toastr';
import { AgentGroupService } from '../../../core/services/agent-group';
import { AgentService } from '../../../core/services/agent';
import { AuthService } from '../../auth/auth.service';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';

@Component({
  selector: 'app-agent-groups',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, 
    FormsModule, // 👈 Aur yahan imports array mein add kiya
    MatButtonModule, MatToolbarModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatExpansionModule,
    HasPermissionDirective
  ],
  templateUrl: './agent-groups.html',
  styleUrls: ['./agent-groups.scss']
})
export class AgentGroupsComponent implements OnInit {
  private groupService = inject(AgentGroupService);
  private agentService = inject(AgentService);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  groups: any[] = [];
  agents: any[] = [];
  loading = true;
  showCreateForm = false;
  selectedGroupId = '';
  selectedAgentToAdd = '';

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['']
  });

  ngOnInit() {
    this.loadGroups();
    this.loadAgents();
  }

  loadGroups() {
    this.loading = true;
    this.groupService.getAll().subscribe({
      next: (data: any[]) => {
        this.groups = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadAgents() {
    this.agentService.getAll().subscribe({
      next: (data: any[]) => {
        this.agents = data;
        this.cdr.detectChanges();
      }
    });
  }

  createGroup() {
    if (this.form.invalid) return;
    this.groupService.create(this.form.value).subscribe({
      next: () => {
        this.toastr.success('Group created!');
        this.showCreateForm = false;
        this.form.reset();
        this.loadGroups();
      },
      error: () => this.toastr.error('Failed to create group')
    });
  }

  addMember(groupId: string) {
    if (!this.selectedAgentToAdd) return;
    this.groupService.addMember(groupId, this.selectedAgentToAdd)
      .subscribe({
        next: () => {
          this.toastr.success('Member added!');
          this.selectedAgentToAdd = '';
          this.loadGroups();
        },
        error: (err: any) =>
          this.toastr.error(err.error?.message || 'Failed')
      });
  }

  removeMember(groupId: string, userId: string) {
    this.groupService.removeMember(groupId, userId).subscribe({
      next: () => {
        this.toastr.success('Member removed');
        this.loadGroups();
      }
    });
  }

  deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return;
    this.groupService.delete(id).subscribe({
      next: () => {
        this.toastr.success('Group deleted');
        this.loadGroups();
      }
    });
  }

  getAvailableAgents(group: any): any[] {
    const memberIds = group.members?.map((m: any) => m.userId) || [];
    return this.agents.filter(a => !memberIds.includes(a.id));
  }

  logout() {
    this.authService.logout();
  }
}