import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule,
  FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-agent-groups-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agent-groups-settings.html',
  styleUrls: ['./agent-groups-settings.scss']
})
export class AgentGroupsSettingsComponent implements OnInit {

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  groups: any[] = [];
  agents: any[] = [];
  loading = false;
  showForm = false;
  editingId = '';
  selectedGroupMembers: string[] = [];

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    description: ['']
  });

  ngOnInit() {
    this.loadGroups();
    this.loadAgents();
  }

  loadGroups() {
    this.http.get<any[]>(
      `${environment.apiUrl}/AgentGroups`
    ).subscribe({
      next: (data) => {
        this.groups = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadAgents() {
    this.http.get<any[]>(
      `${environment.apiUrl}/Agents`
    ).subscribe({
      next: (data) => {
        this.agents = data;
        this.cdr.detectChanges();
      }
    });
  }

  // ✅ Kisi agent ka group pata karo (editing group ko exclude karo)
  getAgentCurrentGroup(agentId: string): string {
    const agentIdLower = agentId.toLowerCase();
    const group = this.groups.find(g => {
      if (g.id === this.editingId) return false; // current group ignore
      const ids: string[] = g.memberIds || g.MemberIds || [];
      return ids.some(mid => mid.toLowerCase() === agentIdLower);
    });
    return group ? group.name : '';
  }

  // ✅ Agent already kisi aur group mein hai?
  isAgentInOtherGroup(agentId: string): boolean {
    return !!this.getAgentCurrentGroup(agentId);
  }

  saveGroup() {
    if (this.form.invalid) return;

    const payload = {
      name: this.form.value.name,
      description: this.form.value.description || '',
      memberIds: this.selectedGroupMembers
    };

    const req = this.editingId
      ? this.http.put(
          `${environment.apiUrl}/AgentGroups/${this.editingId}`,
        payload)
      : this.http.post(
          `${environment.apiUrl}/AgentGroups`,
        payload);

    req.subscribe({
      next: () => {
        this.showForm = false;
        this.editingId = '';
        this.form.reset();
        this.selectedGroupMembers = [];
        Promise.resolve().then(() =>
          this.toastr.success('Group saved!')
        );
        this.loadGroups();
        this.cdr.detectChanges();
      },
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed to save group')
        )
    });
  }

  editGroup(g: any) {
    this.editingId = g.id;
    this.form.patchValue({
      name: g.name,
      description: g.description || ''
    });

    // ✅ UUID case fix — memberIds lowercase karke store karo
    const rawIds: string[] = g.memberIds || g.MemberIds || [];
    this.selectedGroupMembers = rawIds.map((id: string) => id.toLowerCase());

    this.showForm = true;
    this.cdr.detectChanges();
  }

  openNewForm() {
    this.editingId = '';
    this.form.reset();
    this.selectedGroupMembers = [];
    this.showForm = true;
  }

  deleteGroup(id: string) {
    if (!confirm('Delete this group? All members will be removed.')) return;
    this.http.delete(`${environment.apiUrl}/AgentGroups/${id}`).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success('Group deleted'));
        this.loadGroups();
      },
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed to delete'))
    });
  }

  toggleMember(agentId: string) {
    // ✅ Already kisi aur group mein hai to allow nahi
    if (!this.isMember(agentId) &&
        this.isAgentInOtherGroup(agentId)) {
      const groupName = this.getAgentCurrentGroup(agentId);
      Promise.resolve().then(() =>
        this.toastr.warning(
          `This agent is already in "${groupName}". Remove them from there first.`)
      );
      return;
    }
    const agentIdLower = agentId.toLowerCase();
    const idx = this.selectedGroupMembers.indexOf(agentIdLower);
    if (idx > -1)
      this.selectedGroupMembers.splice(idx, 1);
    else
      this.selectedGroupMembers.push(agentIdLower);
    this.cdr.detectChanges();
  }

  // ✅ UUID lowercase compare
  isMember(agentId: string): boolean {
    return this.selectedGroupMembers
      .includes(agentId.toLowerCase());
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#22c55e',
      '#3b82f6','#8b5cf6','#ec4899'
    ];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }
}