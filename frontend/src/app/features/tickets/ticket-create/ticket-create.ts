import { Component, OnInit, ChangeDetectorRef, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { TicketService } from '../../../core/services/ticket';
import { AgentService } from '../../../core/services/agent';
import { AgentGroupService } from '../../../core/services/agent-group';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule,
    FormsModule, MatProgressSpinnerModule, LayoutComponent
  ],
  templateUrl: './ticket-create.html',
  styleUrls: ['./ticket-create.scss']
})
export class TicketCreateComponent implements OnInit {
  private ticketService = inject(TicketService);
  private agentService = inject(AgentService);
  private groupService = inject(AgentGroupService);
  private http = inject(HttpClient);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('descEditor') descEditorRef!: ElementRef;

  loading = false;
  uploading = false;
  agents: any[] = [];
  groups: any[] = [];
  templates: any[] = [];
  selectedTemplateId = '';
  pendingFiles: File[] = [];
  tagInput = '';
  tags: string[] = [];
  customFields: any[] = [];
  customFieldValues: { [key: string]: string } = {};

  ticketTypes = [
    'Question', 'Incident', 'Problem', 'Feature Request',
    'Request', 'Data', 'Customer Training', 'Backend Script',
    'System Gap', 'Release', 'Information Only', 'On Hold'
  ];

  statuses = [
    'Open', 'Pending', 'Resolved on Beta',
    'Resolved', 'On Hold', 'Close'
  ];

  priorities = ['Low', 'Medium', 'High', 'Urgent'];

  categories = [
    'General', 'Technical', 'Billing',
    'Sales', 'Network', 'Hardware', 'Other'
  ];

  form: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', Validators.required],
    category: ['General', Validators.required],
    priority: ['Medium', Validators.required],
    ticketType: ['Question', Validators.required],
    status: ['Open', Validators.required],
    assignedToUserId: [''],
    agentGroupId: ['']
  });

  ngOnInit() {
    this.loadAgents();
    this.loadGroups();
    this.loadTemplates();
    this.loadCustomFields();
  }

  loadAgents() {
    this.agentService.getAll().subscribe({
      next: (data) => {
        this.agents = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadGroups() {
    this.groupService.getAll().subscribe({
      next: (data) => {
        this.groups = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadTemplates() {
    this.http.get<any[]>(`${environment.apiUrl}/TicketTemplates`).subscribe({
      next: (data) => {
        this.templates = data;
        this.cdr.detectChanges();
      }
    });
  }

  loadCustomFields() {
    this.http.get<any[]>(`${environment.apiUrl}/CustomFields`).subscribe({
      next: (data) => {
        this.customFields = data;
        data.forEach(f => this.customFieldValues[f.id] = '');
        this.cdr.detectChanges();
      }
    });
  }

  applyTemplate(templateId: string) {
    const t = this.templates.find(t => t.id === templateId);
    if (t) {
      this.form.patchValue({
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        ticketType: t.ticketType || 'Support'
      });
    }
  }

  addTag() {
    const tag = this.tagInput.trim().toLowerCase();
    if (tag && !this.tags.includes(tag)) {
      this.tags.push(tag);
      this.tagInput = '';
      this.cdr.detectChanges();
    }
  }

  removeTag(tag: string) {
    this.tags = this.tags.filter(t => t !== tag);
    this.cdr.detectChanges();
  }

  onFileSelect(event: any) {
    const files = Array.from(event.target.files) as File[];
    this.pendingFiles.push(...files);
    this.cdr.detectChanges();
  }

  removePendingFile(index: number) {
    this.pendingFiles.splice(index, 1);
    this.cdr.detectChanges();
  }

  getFileIcon(type: string): string {
    if (type?.startsWith('image/')) return '🖼';
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('word')) return '📝';
    if (type?.includes('excel')) return '📊';
    if (type?.includes('zip')) return '🗜';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }

  onDescInput(event: any) {
    this.form.patchValue({
      description: event.target.innerHTML
    }, { emitEvent: false });
  }

  docExec(command: string) {
    document.execCommand(command, false);
  }

  async onSubmit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const formVal = this.form.value;
      const payload = {
        title: formVal.title,
        description: this.descEditorRef?.nativeElement?.innerHTML
          || formVal.description,
        category: formVal.category,
        priority: formVal.priority,
        ticketType: formVal.ticketType,
        tags: this.tags.length > 0 ? this.tags.join(',') : '',
        assignedToUserId: formVal.assignedToUserId || null,
        agentGroupId: formVal.agentGroupId || null
      };

      const res: any = await this.ticketService
        .create(payload).toPromise();
      const ticketId = res?.id;

      if (ticketId) {
        // Save custom field values
        const cfValues = Object.entries(this.customFieldValues)
          .filter(([, v]) => v)
          .map(([k, v]) => ({
            customFieldId: k,
            value: v
          }));
        if (cfValues.length > 0) {
          await this.http.post(
            `${environment.apiUrl}/CustomFields/ticket/${ticketId}/values`,
            cfValues
          ).toPromise();
        }

        // Upload attachments
        for (const file of this.pendingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          await this.http.post(
            `${environment.apiUrl}/Attachments/upload/${ticketId}`,
            formData
          ).toPromise();
        }
      }

      this.loading = false;
      this.cdr.detectChanges();
      Promise.resolve().then(() => this.toastr.success('Ticket created!'));
      this.router.navigate(['/tickets', ticketId]);
    } catch (err: any) {
      this.loading = false;
      this.cdr.detectChanges();
      Promise.resolve().then(() =>
        this.toastr.error(err?.error?.message || 'Failed')
      );
    }
  }
}