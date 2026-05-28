import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { CustomFieldService } from '../../../core/services/custom-field';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';

@Component({
  selector: 'app-custom-fields',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HasPermissionDirective],
  templateUrl: './custom-fields.html',
  styleUrls: ['./custom-fields.scss']
})
export class CustomFieldsComponent implements OnInit {
  private cfService = inject(CustomFieldService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  fields: any[] = [];
  showForm = false;
  editingId = '';

  fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' }
  ];

  form: FormGroup = this.fb.group({
    label: ['', [Validators.required, Validators.minLength(2)]],
    fieldType: ['text', Validators.required],
    options: [''],
    isRequired: [false],
    sortOrder: [0]
  });

  ngOnInit() {
    this.loadFields();
  }

  loadFields() {
    this.cfService.getAll().subscribe({
      next: (data) => {
        this.fields = data;
        this.cdr.detectChanges();
      }
    });
  }

  saveField() {
    if (this.form.invalid) return;

    const action = this.editingId
      ? this.cfService.update(this.editingId, this.form.value)
      : this.cfService.create(this.form.value);

    action.subscribe({
      next: () => {
        this.showForm = false;
        this.editingId = '';
        this.form.reset({ fieldType: 'text', isRequired: false, sortOrder: 0 });
        Promise.resolve().then(() =>
          this.toastr.success(this.editingId ? 'Updated!' : 'Created!')
        );
        this.loadFields();
      },
      error: () =>
        Promise.resolve().then(() => this.toastr.error('Failed'))
    });
  }

  editField(f: any) {
    this.editingId = f.id;
    this.form.patchValue(f);
    this.showForm = true;
  }

  deleteField(id: string) {
    if (!confirm('Delete this field?')) return;
    this.cfService.delete(id).subscribe({
      next: () => {
        Promise.resolve().then(() => this.toastr.success('Deleted'));
        this.loadFields();
      }
    });
  }

  cancelForm() {
    this.showForm = false;
    this.editingId = '';
    this.form.reset({ fieldType: 'text', isRequired: false, sortOrder: 0 });
  }
}