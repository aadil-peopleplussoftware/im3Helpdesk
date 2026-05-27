import {
  Component,
  OnInit,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';
import { OrgContextService } from '../../../core/services/org-context.service';
import { TimezonePickerComponent } from '../../../shared/components/timezone-picker/timezone-picker.component';

/**
 * Workspace / Organization profile editor.
 *
 * Shows every Organization-level setting grouped into logical sections so the
 * Company Admin can manage branding, contact, mail (IMAP + SMTP), polling,
 * timezone and third-party integrations from a single page. Slug, creation
 * timestamps and polling-onboarded timestamps are surfaced as read-only.
 *
 * Backend endpoints used:
 *   GET  /api/Organizations/current       \u2014 hydrate form
 *   PUT  /api/Organizations/current       \u2014 save changes
 *   POST /api/Organizations/upload-logo   \u2014 upload + persist logo
 */
@Component({
  selector: 'app-organization-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    LayoutComponent,
    TimezonePickerComponent
  ],
  templateUrl: './organization-profile.html',
  styleUrls: ['./organization-profile.scss']
})
export class OrganizationProfileComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private orgContext = inject(OrgContextService);
  public router = inject(Router);

  loading = true;
  saving = false;
  isEditMode = false;
  uploadingLogo = false;

  // Auth gate \u2014 only Company Admin may edit the org profile.
  isCompanyAdmin = false;

  // Snapshot data the API exposes but isn't directly editable from this page.
  readonlyInfo = {
    id: '',
    smtpPasswordSet: false,
    twilioAuthTokenSet: false,
    trialEndsAt: null as string | null,
    emailPollingOnboardedAt: null as string | null,
    createdAt: null as string | null
  };

  /**
   * `true` when the workspace's mail wiring is still missing critical
   * fields (any one of SMTP host/port/from/username/password or IMAP
   * host/port). Drives the orange "Organization profile is incomplete"
   * banner at the top of the page, matching the reminder shown in
   * `profile-page` so admins always have a single, consistent CTA.
   */
  setupIncomplete = false;
  /** Human-readable list of the specific fields that still need values. */
  missingSetupItems: string[] = [];

  logoUrl = '';

  // Polling interval is stored in seconds on the backend. The UI lets the
  // admin pick a number + unit (e.g. 5 minutes).
  pollingValue = 30;
  pollingUnit: 'seconds' | 'minutes' | 'hours' | 'days' = 'seconds';

  // Popular IANA zones surfaced first; the rest are appended from the
  // runtime's IANA database.
  timezones: Array<{ id: string; label: string }> = this.buildTimezoneList();

  form: FormGroup = this.fb.group({
    // \u2500\u2500 Identity & Branding \u2500\u2500
    name: ['', [Validators.required, Validators.maxLength(120)]],
    slug: [{ value: '', disabled: true }],
    brandColor: ['#0078d4'],
    logoUrl: [''],

    // \u2500\u2500 Contact \u2500\u2500
    supportEmail: ['', [Validators.email]],

    // \u2500\u2500 Localization \u2500\u2500
    timezone: ['Asia/Kolkata'],

    // \u2500\u2500 Inbound (IMAP) \u2500\u2500
    imapHost: [''],
    imapPort: [993],
    emailPollingEnabled: [false],

    // \u2500\u2500 Outbound (SMTP) \u2500\u2500
    smtpHost: [''],
    smtpPort: [587],
    smtpFromEmail: ['', [Validators.email]],
    smtpFromName: [''],
    smtpUsername: [''],
    smtpPassword: [''],

    // \u2500\u2500 Integrations \u2500\u2500
    slackWebhookUrl: [''],
    teamsWebhookUrl: [''],
    whatsAppNumber: [''],
    twilioAccountSid: [''],
    twilioAuthToken: [''],

    // ── Recycle Bin retention ──
    recycleBinRetentionValue: [30, [Validators.min(1), Validators.max(36500)]],
    recycleBinRetentionUnit: ['days']
  });

  ngOnInit() {
    this.isCompanyAdmin = this.authService.getUserRole() === 'CompanyAdmin';
    // Defer the initial disable() to a microtask. Calling it synchronously
    // in ngOnInit flips the disabled state on every reactive-form-bound
    // input between Angular's first change-detection pass and its
    // dev-mode verify pass, which triggers NG0100
    // (ExpressionChangedAfterItHasBeenChecked).
    Promise.resolve().then(() => {
      this.form.disable({ emitEvent: false });
      this.cdr.detectChanges();
    });
    this.loadOrg();
  }

  private loadOrg() {
    this.loading = true;
    this.http
      .get<any>(`${environment.apiUrl}/Organizations/current`)
      .subscribe({
        next: (org) => {
          this.readonlyInfo = {
            id: org?.id ?? '',
            smtpPasswordSet: Boolean(org?.smtpPasswordSet),
            twilioAuthTokenSet: Boolean(org?.twilioAuthTokenSet),
            trialEndsAt: org?.trialEndsAt ?? null,
            emailPollingOnboardedAt: org?.emailPollingOnboardedAt ?? null,
            createdAt: org?.createdAt ?? null
          };

          this.logoUrl = org?.logoUrl
            ? environment.baseUrl + org.logoUrl
            : '';

          this.recomputeSetupStatus(org);

          const sec =
            typeof org?.emailPollingIntervalSeconds === 'number'
              ? org.emailPollingIntervalSeconds
              : 30;
          const { value, unit } = this.secondsToFriendly(sec);
          this.pollingValue = value;
          this.pollingUnit = unit;

          this.form.patchValue(
            {
              name: org?.name ?? '',
              slug: org?.slug ?? '',
              brandColor: org?.brandColor || '#0078d4',
              logoUrl: org?.logoUrl ?? '',
              supportEmail: org?.supportEmail ?? '',
              timezone: org?.timezone || 'Asia/Kolkata',
              imapHost: org?.imapHost ?? '',
              imapPort: org?.imapPort ?? 993,
              emailPollingEnabled: Boolean(org?.emailPollingEnabled),
              smtpHost: org?.smtpHost ?? '',
              smtpPort: org?.smtpPort ?? 587,
              smtpFromEmail: org?.smtpFromEmail ?? '',
              smtpFromName: org?.smtpFromName ?? '',
              smtpUsername: org?.smtpUsername ?? '',
              smtpPassword: '',
              slackWebhookUrl: org?.slackWebhookUrl ?? '',
              teamsWebhookUrl: org?.teamsWebhookUrl ?? '',
              whatsAppNumber: org?.whatsAppNumber ?? '',
              twilioAccountSid: org?.twilioAccountSid ?? '',
              // Token is never returned by the API — keep field blank
              // so saving without typing does not wipe it.
              twilioAuthToken: '',
              recycleBinRetentionValue:
                typeof org?.recycleBinRetentionValue === 'number'
                  ? org.recycleBinRetentionValue
                  : 30,
              recycleBinRetentionUnit: org?.recycleBinRetentionUnit || 'days'
            },
            { emitEvent: false }
          );

          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.toastr.error('Failed to load organization');
          this.cdr.detectChanges();
        }
      });
  }

  toggleEditMode() {
    if (!this.isCompanyAdmin) {
      this.toastr.warning(
        'Only the Company Admin can edit organization settings.'
      );
      return;
    }
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.form.enable({ emitEvent: false });
      // Slug stays immutable post-creation.
      this.form.controls['slug'].disable({ emitEvent: false });
    } else {
      this.form.disable({ emitEvent: false });
      this.loadOrg();
    }
  }

  saveOrg() {
    if (this.form.invalid) {
      this.toastr.error('Please fix the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const intervalSec = this.friendlyToSeconds();
    if (intervalSec < 5) {
      this.toastr.error('Polling interval must be at least 5 seconds.');
      return;
    }

    // Capture timezone change \u2014 we'll reload after save so every pure
    // date pipe across the project picks up the new zone immediately.
    const tzChanged = this.orgContext.timezone() !== v.timezone;

    const payload: any = {
      name: v.name,
      brandColor: v.brandColor,
      logoUrl: v.logoUrl,
      supportEmail: v.supportEmail,
      timezone: v.timezone,
      imapHost: v.imapHost || null,
      imapPort: v.imapPort || null,
      emailPollingEnabled: v.emailPollingEnabled,
      emailPollingIntervalSeconds: intervalSec,
      smtpHost: v.smtpHost || null,
      smtpPort: v.smtpPort || null,
      smtpFromEmail: v.smtpFromEmail || null,
      smtpFromName: v.smtpFromName || null,
      smtpUsername: v.smtpUsername || null,
      slackWebhookUrl: v.slackWebhookUrl || null,
      teamsWebhookUrl: v.teamsWebhookUrl || null,
      whatsAppNumber: v.whatsAppNumber || null,
      twilioAccountSid: v.twilioAccountSid || null,
      recycleBinRetentionValue: v.recycleBinRetentionValue || 30,
      recycleBinRetentionUnit: v.recycleBinRetentionUnit || 'days'
    };
    // Only include password if the admin typed a new one \u2014 sending blank
    // would wipe the stored credential.
    if (v.smtpPassword) payload.smtpPassword = v.smtpPassword;
    // Same treatment for the Twilio auth token (it is masked on load).
    if (v.twilioAuthToken) payload.twilioAuthToken = v.twilioAuthToken;

    this.saving = true;
    this.http
      .put(`${environment.apiUrl}/Organizations/current`, payload)
      .subscribe({
        next: () => {
          this.saving = false;
          this.orgContext.setTimezone(v.timezone);
          this.toastr.success('Organization settings saved.');
          this.isEditMode = false;
          this.form.disable({ emitEvent: false });

          if (tzChanged) {
            // Reload so every screen renders dates in the new zone.
            setTimeout(() => window.location.reload(), 600);
          } else {
            this.loadOrg();
          }
        },
        error: () => {
          this.saving = false;
          this.toastr.error('Failed to save organization settings.');
          this.cdr.detectChanges();
        }
      });
  }

  onLogoSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!this.isCompanyAdmin) return;

    const fd = new FormData();
    fd.append('file', file);
    this.uploadingLogo = true;
    this.http
      .post<any>(`${environment.apiUrl}/Organizations/upload-logo`, fd)
      .subscribe({
        next: (res) => {
          this.uploadingLogo = false;
          if (res?.logoUrl) {
            this.form.patchValue(
              { logoUrl: res.logoUrl },
              { emitEvent: false }
            );
            this.logoUrl = environment.baseUrl + res.logoUrl;
            this.toastr.success('Logo updated.');
            this.cdr.detectChanges();
          }
        },
        error: () => {
          this.uploadingLogo = false;
          this.toastr.error('Logo upload failed.');
          this.cdr.detectChanges();
        }
      });
  }

  /**
   * Re-evaluate which mail fields are still missing on the org. Mirrors
   * the logic used in `profile-page.loadMailboxSetupStatus` so the same
   * "incomplete" reminder shows in both surfaces.
   */
  private recomputeSetupStatus(org: any): void {
    const missing: string[] = [];
    if (!org?.smtpHost)        missing.push('SMTP host');
    if (!org?.smtpPort)        missing.push('SMTP port');
    if (!org?.smtpFromEmail)   missing.push('SMTP from-email');
    if (!org?.smtpUsername)    missing.push('SMTP username');
    if (!org?.smtpPasswordSet) missing.push('SMTP password');
    if (!org?.imapHost)        missing.push('IMAP host');
    if (!org?.imapPort)        missing.push('IMAP port');
    this.missingSetupItems = missing;
    this.setupIncomplete = missing.length > 0;
  }

  /**
   * Smoothly scroll to a named section card (used when the admin clicks
   * the "Complete now" banner so the relevant inputs are immediately
   * visible).
   */
  scrollToSection(id: string): void {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Auto-enter edit mode so the admin can start typing right away.
    if (this.isCompanyAdmin && !this.isEditMode) {
      this.toggleEditMode();
    }
  }

  // \u2500\u2500 Polling unit helpers \u2500\u2500
  private secondsToFriendly(sec: number): {
    value: number;
    unit: 'seconds' | 'minutes' | 'hours' | 'days';
  } {
    if (sec <= 0) return { value: 30, unit: 'seconds' };
    if (sec % 86400 === 0) return { value: sec / 86400, unit: 'days' };
    if (sec % 3600 === 0) return { value: sec / 3600, unit: 'hours' };
    if (sec % 60 === 0) return { value: sec / 60, unit: 'minutes' };
    return { value: sec, unit: 'seconds' };
  }

  private friendlyToSeconds(): number {
    const v = Math.max(1, Math.floor(Number(this.pollingValue) || 0));
    switch (this.pollingUnit) {
      case 'days':
        return v * 86400;
      case 'hours':
        return v * 3600;
      case 'minutes':
        return v * 60;
      default:
        return v;
    }
  }

  // \u2500\u2500 Timezone list \u2500\u2500
  private buildTimezoneList(): Array<{ id: string; label: string }> {
    const popular: Array<{ id: string; label: string }> = [
      { id: 'Asia/Kolkata',        label: 'Asia/Kolkata (India)' },
      { id: 'Asia/Qatar',          label: 'Asia/Qatar (Qatar)' },
      { id: 'Asia/Dubai',          label: 'Asia/Dubai (UAE)' },
      { id: 'Asia/Riyadh',         label: 'Asia/Riyadh (Saudi Arabia)' },
      { id: 'Asia/Karachi',        label: 'Asia/Karachi (Pakistan)' },
      { id: 'Asia/Dhaka',          label: 'Asia/Dhaka (Bangladesh)' },
      { id: 'Asia/Singapore',      label: 'Asia/Singapore (Singapore)' },
      { id: 'Asia/Tokyo',          label: 'Asia/Tokyo (Japan)' },
      { id: 'Asia/Shanghai',       label: 'Asia/Shanghai (China)' },
      { id: 'Europe/London',       label: 'Europe/London (UK)' },
      { id: 'Europe/Paris',        label: 'Europe/Paris (France)' },
      { id: 'Europe/Berlin',       label: 'Europe/Berlin (Germany)' },
      { id: 'America/New_York',    label: 'America/New_York (USA East)' },
      { id: 'America/Chicago',     label: 'America/Chicago (USA Central)' },
      { id: 'America/Los_Angeles', label: 'America/Los_Angeles (USA West)' },
      { id: 'Australia/Sydney',    label: 'Australia/Sydney (Australia)' },
      { id: 'UTC',                 label: 'UTC' }
    ];
    const all: string[] =
      typeof (Intl as any).supportedValuesOf === 'function'
        ? (Intl as any).supportedValuesOf('timeZone')
        : popular.map((p) => p.id);
    const popularIds = new Set(popular.map((p) => p.id));
    const rest = all
      .filter((z) => !popularIds.has(z))
      .sort((a, b) => a.localeCompare(b))
      .map((z) => ({ id: z, label: z }));
    return [...popular, ...rest];
  }
}
