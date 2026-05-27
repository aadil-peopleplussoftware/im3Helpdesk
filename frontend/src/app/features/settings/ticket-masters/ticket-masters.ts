import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize, timeout } from 'rxjs/operators';
import {
  TicketMasterField,
  TicketMasterOption,
  TicketMasterService
} from '../../../core/services/ticket-master';

@Component({
  selector: 'app-ticket-masters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ticket-masters.html',
  styleUrls: ['./ticket-masters.scss']
})
export class TicketMastersComponent implements OnInit {
  private readonly service = inject(TicketMasterService);
  private readonly toastr = inject(ToastrService);
  private readonly cdr = inject(ChangeDetectorRef);

  selectedField: TicketMasterField = 'TicketType';
  options: TicketMasterOption[] = [];
  allOptions: Record<TicketMasterField, TicketMasterOption[]> = {
    TicketType: [],
    TicketStatus: [],
    TicketPriority: []
  };
  loading = false;

  showForm = false;
  editingId = '';
  editingOriginalValue = '';

  form = {
    value: '',
    label: '',
    sortOrder: 0,
    isActive: true
  };

  readonly fieldTabs: Array<{ field: TicketMasterField; label: string }> = [
    { field: 'TicketType', label: 'Ticket Type' },
    { field: 'TicketStatus', label: 'Ticket Status' },
    { field: 'TicketPriority', label: 'Ticket Priority' }
  ];

  ngOnInit(): void {
    this.loadAllOptions(true);
  }

  changeField(field: TicketMasterField) {
    if (this.selectedField === field) return;
    this.selectedField = field;
    this.resetForm();
    this.applySelectedOptions();
  }

  loadAllOptions(showLoader: boolean = false) {
    if (showLoader) {
      this.loading = true;
    }

    this.service.getAll(false).pipe(
      timeout(12000),
      finalize(() => {
        if (showLoader) {
          // Defer to next macrotask to avoid NG0100 during click-driven updates.
          setTimeout(() => {
            this.loading = false;
            this.cdr.markForCheck();
          });
        }
      })
    ).subscribe({
      next: (data) => {
        this.allOptions = {
          TicketType: [...(data.ticketTypes || [])],
          TicketStatus: [...(data.ticketStatuses || [])],
          TicketPriority: [...(data.ticketPriorities || [])]
        };
        this.applySelectedOptions();
      },
      error: (err) => {
        this.allOptions = {
          TicketType: [],
          TicketStatus: [],
          TicketPriority: []
        };
        this.options = [];
        this.toastr.error(err?.error?.message || 'Failed to load ticket masters');
      }
    });
  }

  getCount(field: TicketMasterField): number {
    return this.allOptions[field]?.length || 0;
  }

  openCreate() {
    this.resetForm();
    this.showForm = true;
  }

  edit(item: TicketMasterOption) {
    this.editingId = item.id;
    this.editingOriginalValue = item.value;
    this.form = {
      value: item.value,
      label: item.label,
      sortOrder: item.sortOrder,
      isActive: item.isActive
    };
    this.showForm = true;
  }

  save() {
    const value = this.normalizeForField(this.selectedField, this.form.value);
    const label = this.form.label.trim();

    if (!value) {
      this.toastr.warning('Value is required');
      return;
    }

    const payload = {
      value,
      label: label || value,
      sortOrder: Number(this.form.sortOrder || 0),
      isActive: this.form.isActive
    };

    if (!this.editingId) {
      this.service.create({
        field: this.selectedField,
        value: payload.value,
        label: payload.label,
        sortOrder: payload.sortOrder
      }).subscribe({
        next: () => {
          this.toastr.success('Created');
          this.resetForm();
          this.loadAllOptions(false);
        },
        error: (err) => {
          this.toastr.error(err?.error?.message || 'Create failed');
        }
      });
      return;
    }

    const updatePayload: {
      value?: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {
      label: payload.label,
      sortOrder: payload.sortOrder,
      isActive: payload.isActive
    };

    if (!this.isSameValue(value, this.editingOriginalValue)) {
      updatePayload.value = value;
    }

    this.service.update(this.editingId, updatePayload).subscribe({
      next: () => {
        this.toastr.success('Updated');
        this.resetForm();
        this.loadAllOptions(false);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Update failed');
      }
    });
  }

  activate(item: TicketMasterOption) {
    if (item.isActive) return;

    this.service.update(item.id, { isActive: true }).subscribe({
      next: () => {
        this.toastr.success('Activated');
        this.loadAllOptions(false);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Failed to activate option');
      }
    });
  }

  deactivate(item: TicketMasterOption) {
    if (!item.isActive) return;
    if (!confirm('Disable this option?')) return;

    this.service.update(item.id, { isActive: false }).subscribe({
      next: () => {
        this.toastr.success('Disabled');
        this.loadAllOptions(false);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Failed to disable option');
      }
    });
  }

  remove(item: TicketMasterOption) {
    if (!confirm('Delete this option permanently? This cannot be undone.')) return;

    this.service.hardDelete(item.id).subscribe({
      next: () => {
        this.toastr.success('Deleted permanently');
        this.loadAllOptions(false);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Failed to delete option');
      }
    });
  }

  private applySelectedOptions() {
    this.options = [...(this.allOptions[this.selectedField] || [])]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }

  private normalizeForField(field: TicketMasterField, rawValue: string): string {
    const value = (rawValue || '').trim();
    if (!value) return '';

    const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (field === 'TicketPriority') {
      if (compact.startsWith('low') || compact === 'lo' || compact === 'l') return 'Low';
      if (compact.startsWith('medium') || compact.startsWith('med') || compact === 'm') return 'Medium';
      if (compact.startsWith('high') || compact === 'hi' || compact === 'h') return 'High';
      if (compact.startsWith('critical') || compact.startsWith('crit') || compact.startsWith('urgent') || compact === 'c' || compact === 'ur' || compact === 'u') return 'Critical';
      return value;
    }

    if (field === 'TicketStatus') {
      if (compact === 'open' || compact === 'o') return 'Open';
      if (compact === 'inprogress' || compact === 'progress' || compact === 'ip' || compact === 'inp') return 'InProgress';
      if (compact === 'pending' || compact === 'p') return 'Pending';
      if (compact === 'resolvedonbeta' || compact === 'rob' || compact === 'betaresolved') return 'ResolvedOnBeta';
      if (compact === 'resolved' || compact === 'res' || compact === 'r') return 'Resolved';
      if (compact === 'closed' || compact === 'close' || compact === 'cl') return 'Closed';
      return value;
    }

    return value;
  }

  private resetForm() {
    this.showForm = false;
    this.editingId = '';
    this.editingOriginalValue = '';
    this.form = {
      value: '',
      label: '',
      sortOrder: 0,
      isActive: true
    };
  }

  private isSameValue(left: string, right: string): boolean {
    return (left || '').trim().toLowerCase() === (right || '').trim().toLowerCase();
  }
}
