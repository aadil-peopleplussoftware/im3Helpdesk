import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule, ReactiveFormsModule,
  FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-agent-groups-settings',
  standalone: true,
  imports: [CommonModule, FormsModule,
    ReactiveFormsModule],
  templateUrl:
    './agent-groups-settings.html',
  styleUrls: [
    './agent-groups-settings.scss']
})
export class AgentGroupsSettingsComponent
  implements OnInit {

  private http = inject(HttpClient);
  private authService = inject(AuthService);
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

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }

  ngOnInit() {
    this.loadGroups();
    this.loadAgents();
  }

  loadGroups() {
    this.http.get<any[]>(
      'https://localhost:7071/api/AgentGroups',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.groups = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadAgents() {
    this.http.get<any[]>(
      'https://localhost:7071/api/Agents',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.agents = data;
        this.cdr.detectChanges();
      }
    });
  }

  saveGroup() {
    if (this.form.invalid) return;

    const payload = {
      ...this.form.value,
      memberIds: this.selectedGroupMembers
    };

    const req = this.editingId
      ? this.http.put(
          `https://localhost:7071/api/AgentGroups` +
          `/${this.editingId}`,
          payload,
          { headers: this.getHeaders() })
      : this.http.post(
          'https://localhost:7071/api/AgentGroups',
          payload,
          { headers: this.getHeaders() });

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
      },
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed')
        )
    });
  }

  editGroup(g: any) {
    this.editingId = g.id;
    this.form.patchValue(g);
    this.selectedGroupMembers =
      g.memberIds || [];
    this.showForm = true;
  }

  deleteGroup(id: string) {
    if (!confirm('Delete this group?')) return;
    this.http.delete(
      `https://localhost:7071/api/AgentGroups/${id}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success('Deleted'));
        this.loadGroups();
      }
    });
  }

  toggleMember(agentId: string) {
    const idx = this.selectedGroupMembers
      .indexOf(agentId);
    if (idx > -1)
      this.selectedGroupMembers.splice(idx, 1);
    else
      this.selectedGroupMembers.push(agentId);
    this.cdr.detectChanges();
  }

  isMember(agentId: string): boolean {
    return this.selectedGroupMembers
      .includes(agentId);
  }
}