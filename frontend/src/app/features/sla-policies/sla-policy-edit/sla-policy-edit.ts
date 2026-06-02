import { Component, OnInit, inject, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import {
  SlaPoliciesService,
  SlaPolicyDetail,
  SlaTarget,
  SlaReminder,
  SlaEscalation,
  TicketPriorityValue
} from '../../../core/services/sla-policies.service';
import { AgentService } from '../../../core/services/agent';

interface RecipientOption {
  /** Stable token stored in the CSV — e.g. "AssignedAgent" or "User:{guid}". */
  value: string;
  label: string;
  /** 0 = Freshdesk pseudo-agents (always at top); 1 = real agents from DB. */
  sortGroup: number;
}

interface TargetRow extends SlaTarget {
  /** First response duration broken into day/hrs/mins for the editor UI. */
  frDay: number | null;
  frHr: number | null;
  frMin: number | null;
  /** Resolution duration broken into day/hrs/mins for the editor UI. */
  resDay: number | null;
  resHr: number | null;
  resMin: number | null;
}

@Component({
  selector: 'app-sla-policy-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './sla-policy-edit.html',
  styleUrls: ['./sla-policy-edit.scss']
})
export class SlaPolicyEditComponent implements OnInit {
  private api = inject(SlaPoliciesService);
  private agents = inject(AgentService);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private host = inject(ElementRef<HTMLElement>);

  loading = true;
  saving = false;
  policyId = '';
  policy: SlaPolicyDetail | null = null;
  targets: TargetRow[] = [];
  reminders: SlaReminder[] = [];
  escalations: SlaEscalation[] = [];

  recipientOptions: RecipientOption[] = [];

  /** Stable key (e.g. "rem:0") of the picker that's currently open. */
  openPickerKey: string | null = null;
  pickerSearch = '';

  readonly priorityOrder: TicketPriorityValue[] = [3, 2, 1, 0];

  readonly approachChoices = [
    { value: 15,   label: '15 minutes' },
    { value: 30,   label: '30 minutes' },
    { value: 60,   label: '1 hour' },
    { value: 120,  label: '2 hours' },
    { value: 240,  label: '4 hours' },
    { value: 480,  label: '8 hours' },
    { value: 1440, label: '1 day' },
  ];

  readonly escalateAfterChoices = [
    { value: 0,   label: 'Immediately' },
    { value: 30,  label: '30 minutes' },
    { value: 60,  label: '1 hour' },
    { value: 120, label: '2 hours' },
    { value: 240, label: '4 hours' },
  ];

  ngOnInit() {
    this.policyId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.policyId) {
      this.router.navigate(['/sla-policies']);
      return;
    }
    this.loadAgents();
    this.load();
  }

  private loadAgents() {
    const pseudo: RecipientOption[] = [
      { value: 'AssignedAgent',    label: 'Assigned agent',    sortGroup: 0 },
      { value: 'Group',            label: 'Group leads',       sortGroup: 0 },
      { value: 'ReportingManager', label: 'Reporting manager', sortGroup: 0 },
    ];
    this.agents.getAll().subscribe({
      next: (rows) => {
        const real: RecipientOption[] = (rows || [])
          .map((r: any) => ({
            value: `User:${r.id || r.Id}`,
            label: r.fullName || r.FullName || r.email || r.Email || 'Agent',
            sortGroup: 1,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.recipientOptions = [...pseudo, ...real];
        this.cdr.detectChanges();
      },
      error: () => {
        this.recipientOptions = pseudo;
      }
    });
  }

  load() {
    this.loading = true;
    this.api.get(this.policyId).subscribe({
      next: (p) => {
        this.policy = p;
        // Backend may serialize priority as enum name ("Critical","High"…)
        // because JsonStringEnumConverter is registered globally. Normalize
        // back to the numeric value the editor uses.
        const priorityNames: Record<string, TicketPriorityValue> = {
          'Low': 0, 'Medium': 1, 'High': 2, 'Critical': 3, 'Urgent': 3,
        };
        const toNum = (v: any): TicketPriorityValue =>
          (typeof v === 'number' ? v : priorityNames[String(v)] ?? 0) as TicketPriorityValue;
        this.targets = this.priorityOrder.map(pr => {
          const found = p.targets.find(t => toNum(t.priority) === pr);
          const base: SlaTarget = found
            ? { ...found, priority: toNum(found.priority) }
            : {
                priority: pr,
                firstResponseMinutes: 0,
                resolutionMinutes: 0,
                operationalHours: 'BusinessHours',
                escalationEnabled: true,
              };
          const fr = this.splitDuration(base.firstResponseMinutes);
          const res = this.splitDuration(base.resolutionMinutes);
          return {
            ...base,
            frDay: fr.day, frHr: fr.hr, frMin: fr.min,
            resDay: res.day, resHr: res.hr, resMin: res.min,
          } as TargetRow;
        });
        this.reminders = p.reminders.map(r => ({ ...r }));
        this.escalations = p.escalations.map(es => ({ ...es }));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load SLA policy.');
        this.cdr.detectChanges();
      }
    });
  }

  priorityLabel(p: TicketPriorityValue) { return SlaPoliciesService.priorityLabel(p); }
  priorityColor(p: TicketPriorityValue) { return SlaPoliciesService.priorityColor(p); }

  /** Convert total minutes to day/hr/min parts; nulls render as empty placeholder. */
  private splitDuration(totalMinutes: number): { day: number | null; hr: number | null; min: number | null } {
    const t = Math.max(0, Math.floor(totalMinutes || 0));
    const day = Math.floor(t / 1440);
    const hr = Math.floor((t % 1440) / 60);
    const min = t % 60;
    return {
      day: day || null,
      hr: hr || null,
      min: min || null,
    };
  }

  /** Re-derive `firstResponseMinutes` / `resolutionMinutes` from the day/hr/min inputs. */
  recomputeDuration(row: TargetRow, field: 'firstResponse' | 'resolution') {
    const clamp = (v: number | null, max: number) => {
      const n = Number(v) || 0;
      return Math.max(0, Math.min(max, Math.floor(n)));
    };
    if (field === 'firstResponse') {
      const d = clamp(row.frDay, 365);
      const h = clamp(row.frHr, 23);
      const m = clamp(row.frMin, 59);
      row.firstResponseMinutes = d * 1440 + h * 60 + m;
    } else {
      const d = clamp(row.resDay, 365);
      const h = clamp(row.resHr, 23);
      const m = clamp(row.resMin, 59);
      row.resolutionMinutes = d * 1440 + h * 60 + m;
    }
  }

  // ── Recipient picker (chip multi-select) ─────────────────────

  pickerKey(kind: 'rem' | 'esc', index: number) { return `${kind}:${index}`; }

  togglePicker(key: string, ev: Event) {
    ev.stopPropagation();
    this.openPickerKey = this.openPickerKey === key ? null : key;
    this.pickerSearch = '';
  }

  selectedTokens(csv: string): string[] {
    return (csv || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  selectedChips(csv: string): RecipientOption[] {
    const tokens = this.selectedTokens(csv);
    return tokens.map(t => {
      const found = this.recipientOptions.find(o => o.value === t);
      return found || { value: t, label: this.fallbackLabel(t), sortGroup: 1 };
    });
  }

  private fallbackLabel(token: string): string {
    if (token === 'AssignedAgent')    return 'Assigned agent';
    if (token === 'Group')            return 'Group leads';
    if (token === 'ReportingManager') return 'Reporting manager';
    if (token.startsWith('User:'))    return 'Agent';
    return token;
  }

  filteredOptions(): RecipientOption[] {
    const q = this.pickerSearch.trim().toLowerCase();
    if (!q) return this.recipientOptions;
    return this.recipientOptions.filter(o => o.label.toLowerCase().includes(q));
  }

  isChecked(csv: string, value: string): boolean {
    return this.selectedTokens(csv).includes(value);
  }

  toggleOption(rule: { recipients: string }, value: string, ev: Event) {
    ev.stopPropagation();
    const set = new Set(this.selectedTokens(rule.recipients));
    if (set.has(value)) set.delete(value); else set.add(value);
    rule.recipients = Array.from(set).join(',');
  }

  removeChip(rule: { recipients: string }, value: string, ev: Event) {
    ev.stopPropagation();
    const set = new Set(this.selectedTokens(rule.recipients));
    set.delete(value);
    rule.recipients = Array.from(set).join(',');
  }

  // Close picker on outside click
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.openPickerKey) return;
    const target = ev.target as HTMLElement;
    if (target.closest('.recipient-picker.open')) return;
    if (target.closest('.recipient-picker-trigger')) return;
    this.openPickerKey = null;
  }

  // ── Reminders / escalations CRUD ─────────────────────────────
  addReminder() {
    this.reminders.push({
      targetType: 'FirstResponse',
      approachInMinutes: 30,
      recipients: 'AssignedAgent',
    });
  }
  removeReminder(i: number) { this.reminders.splice(i, 1); }

  addEscalation() {
    this.escalations.push({
      targetType: 'FirstResponse',
      escalateAfterMinutes: 0,
      recipients: 'AssignedAgent',
    });
  }
  removeEscalation(i: number) { this.escalations.splice(i, 1); }

  // ── Save / Cancel ────────────────────────────────────────────
  cancel() { this.router.navigate(['/sla-policies']); }

  save() {
    if (!this.policy) return;

    // Treat fully-empty rows as "not configured" — backend SlaService falls
    // back to hardcoded defaults for those priorities. Only flag rows where
    // the user partially filled one side (response set but resolution blank,
    // or vice versa).
    const partial = this.targets.find(t =>
      (t.firstResponseMinutes > 0 && t.resolutionMinutes <= 0) ||
      (t.firstResponseMinutes <= 0 && t.resolutionMinutes > 0)
    );
    if (partial) {
      this.toastr.warning(
        `${this.priorityLabel(partial.priority)}: please set BOTH first response AND resolution time.`
      );
      return;
    }

    const anyConfigured = this.targets.some(t =>
      t.firstResponseMinutes > 0 && t.resolutionMinutes > 0
    );
    if (!anyConfigured) {
      this.toastr.warning('Please configure at least one priority row.');
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();
    this.api.update(this.policy.id, {
      name: this.policy.name,
      description: this.policy.description,
      isActive: this.policy.isActive,
      targets: this.targets.map(t => ({
        id: t.id,
        priority: t.priority,
        firstResponseMinutes: t.firstResponseMinutes,
        resolutionMinutes: t.resolutionMinutes,
        operationalHours: t.operationalHours,
        escalationEnabled: t.escalationEnabled,
      })),
      reminders: this.reminders.map(r => ({
        ...r,
        recipients: r.recipients || 'AssignedAgent',
      })),
      escalations: this.escalations.map(es => ({
        ...es,
        recipients: es.recipients || 'AssignedAgent',
      })),
    }).subscribe({
      next: () => {
        this.toastr.success('SLA policy saved.');
        setTimeout(() => {
          this.saving = false;
          this.cdr.detectChanges();
          this.router.navigate(['/sla-policies']);
        });
      },
      error: (err) => {
        const msg = err?.error?.message || err?.error?.detail || 'Failed to save policy.';
        this.toastr.error(msg);
        setTimeout(() => {
          this.saving = false;
          this.cdr.detectChanges();
        });
      }
    });
  }
}
