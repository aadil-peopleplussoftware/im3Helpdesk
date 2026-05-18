import { Component, OnInit, Input, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { TicketTemplateService } from '../../../core/services/ticket-template';

@Component({
  selector: 'app-ticket-templates',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './ticket-templates.html',
  styleUrls: ['./ticket-templates.scss']
})
export class TicketTemplatesComponent implements OnInit {
  @Input() embedded = false;

  private templateService = inject(TicketTemplateService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  templates: any[] = [];
  loading = true;
  showForm = false;

  ticketTypes = [
    'Question', 'Incident', 'Problem', 'Feature Request',
    'Request', 'Support', 'Data', 'Customer Training',
    'Backend Script', 'System Gap', 'Release',
    'Information Only', 'On Hold', 'Bug', 'Billing'
  ];

  statuses = [
    'Open', 'Pending', 'Resolved on Beta',
    'Resolved', 'On Hold', 'Close'
  ];

  priorities = ['Low', 'Medium', 'High', 'Urgent', 'Critical'];

  categories = [
    'General', 'Technical', 'Billing',
    'Sales', 'Network', 'Hardware', 'Other'
  ];

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    title: ['', Validators.required],
    description: [''],
    category: ['General', Validators.required],
    priority: ['Medium', Validators.required],
    ticketType: ['Support', Validators.required],
    status: ['Open', Validators.required],
    tags: ['']
  });

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loading = true;
    this.templateService.getAll().subscribe({
      next: (data: any[]) => {
        this.templates = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  saveTemplate() {
    if (this.form.invalid) return;
    this.templateService.create(this.form.value).subscribe({
      next: () => {
        this.showForm = false;
        this.form.reset({
          category: 'General',
          priority: 'Medium',
          ticketType: 'Support',
          status: 'Open'
        });
        Promise.resolve().then(() =>
          this.toastr.success('Template created!')
        );
        this.loadTemplates();
      },
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed to create template')
        )
    });
  }

  deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    this.templateService.delete(id).subscribe({
      next: () => {
        Promise.resolve().then(() =>
          this.toastr.success('Template deleted')
        );
        this.loadTemplates();
      }
    });
  }

  getPriorityColor(priority: string): string {
    const c: any = {
      'Low': '#22c55e', 'Medium': '#3b82f6',
      'High': '#f59e0b', 'Urgent': '#ef4444',
      'Critical': '#dc2626'
    };
    return c[priority] || '#666';
  }
}