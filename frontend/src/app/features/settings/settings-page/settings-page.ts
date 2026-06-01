import { Component, OnInit, ChangeDetectorRef, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { TranslationService } from '../../../core/services/translation';
import { ThemeService } from '../../../core/services/theme.service';
import { IconStyleId, IconStyleService } from '../../../core/services/icon-style.service';
import { OrgContextService } from '../../../core/services/org-context.service';
import { environment } from '../../../../environments/environment';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { TicketTemplatesComponent } from '../ticket-templates/ticket-templates';
import { EmailNotificationsComponent } from '../email-notifications/email-notifications';
import { AuditLogComponent } from '../audit-log/audit-log';
import { CustomFieldsComponent } from '../custom-fields/custom-fields';
import { WhatsappSettingsComponent } from '../whatsapp-settings/whatsapp-settings';
import { IntegrationsComponent } from '../integrations/integrations';
import { AgentGroupsSettingsComponent } from '../agent-groups-settings/agent-groups-settings';
import { TicketMastersComponent } from '../ticket-masters/ticket-masters';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDividerModule,
    MatSlideToggleModule,
    LayoutComponent,
    TicketTemplatesComponent,
    EmailNotificationsComponent,
    AuditLogComponent,
    CustomFieldsComponent,
    TicketMastersComponent,
    WhatsappSettingsComponent,
    IntegrationsComponent,
    AgentGroupsSettingsComponent
  ],
  templateUrl: './settings-page.html',
  styleUrls: ['./settings-page.scss']
})
export class SettingsPageComponent implements OnInit {
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private translationService = inject(TranslationService);
  private themeService = inject(ThemeService);
  private iconStyleService = inject(IconStyleService);
  private http = inject(HttpClient);
  private orgContext = inject(OrgContextService);

  @Input() embedded: boolean = false;
  activeTab = 'settings';

  tabs = [
    { id: 'settings', label: 'General Settings', icon: '\u{1F3A8}' },
    { id: 'notifications', label: 'Notifications', icon: '\u{1F514}' },
    { id: 'templates', label: 'Ticket Templates', icon: '\u{1F4CB}' },
    { id: 'groups', label: 'Agent Groups', icon: '\u{1F465}' },
    { id: 'custom-fields', label: 'Custom Fields', icon: '\u2699' },
    { id: 'ticket-masters', label: 'Ticket Configuration', icon: '\u{1F4CA}' },
    { id: 'audit', label: 'Audit Log', icon: '\u{1F50D}' },
    { id: 'integrations', label: 'Integrations', icon: '\u{1F517}' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '\u{1F4AC}' },
  ];

  currentTheme = 'theme-blue';
  currentIconStyle: IconStyleId = 'outline';
  emailNotifications = true;
  browserNotifications = false;
  language = 'en';

  settingsSidebarPosition: 'left' | 'right' | 'top' | 'bottom' = 'left';
  mainSidebarPosition: 'left' | 'bottom' = 'left';

  // Email polling cadence (general settings).
  // Stored on the backend in seconds; the UI lets the user pick a number
  // plus a unit so they can type e.g. "5 minutes" or "45 seconds".
  pollingIntervalValue: number = 30;
  pollingIntervalUnit: 'seconds' | 'minutes' | 'hours' | 'days' = 'seconds';
  pollingSaving = false;

  // Project-wide IANA timezone (e.g. "Asia/Kolkata").
  timezone: string = 'Asia/Kolkata';
  timezoneSaving = false;

  // Friendly labels for the most common zones — surfaced at the top of
  // the dropdown so users don't have to scroll to find their country.
  // Keep this list short; everything else is appended from the IANA db.
  private readonly popularZones: Array<{ id: string; label: string }> = [
    { id: 'Asia/Kolkata',       label: 'Asia/Kolkata (India)' },
    { id: 'Asia/Qatar',         label: 'Asia/Qatar (Qatar)' },
    { id: 'Asia/Dubai',         label: 'Asia/Dubai (UAE)' },
    { id: 'Asia/Riyadh',        label: 'Asia/Riyadh (Saudi Arabia)' },
    { id: 'Asia/Karachi',       label: 'Asia/Karachi (Pakistan)' },
    { id: 'Asia/Dhaka',         label: 'Asia/Dhaka (Bangladesh)' },
    { id: 'Asia/Singapore',     label: 'Asia/Singapore (Singapore)' },
    { id: 'Asia/Tokyo',         label: 'Asia/Tokyo (Japan)' },
    { id: 'Asia/Shanghai',      label: 'Asia/Shanghai (China)' },
    { id: 'Europe/London',      label: 'Europe/London (UK)' },
    { id: 'Europe/Paris',       label: 'Europe/Paris (France)' },
    { id: 'Europe/Berlin',      label: 'Europe/Berlin (Germany)' },
    { id: 'America/New_York',   label: 'America/New_York (USA East)' },
    { id: 'America/Chicago',    label: 'America/Chicago (USA Central)' },
    { id: 'America/Los_Angeles',label: 'America/Los_Angeles (USA West)' },
    { id: 'Australia/Sydney',   label: 'Australia/Sydney (Australia)' },
    { id: 'UTC',                label: 'UTC' }
  ];

  // Full dropdown options: popular first (with friendly labels), then
  // every other IANA zone the runtime knows about.
  timezones: Array<{ id: string; label: string }> = this.buildTimezoneList();

  private buildTimezoneList(): Array<{ id: string; label: string }> {
    const allZones: string[] =
      typeof (Intl as any).supportedValuesOf === 'function'
        ? (Intl as any).supportedValuesOf('timeZone')
        : [
            'UTC', 'Asia/Kolkata', 'Asia/Qatar', 'Asia/Dubai',
            'Asia/Singapore', 'Asia/Tokyo',
            'Europe/London', 'Europe/Paris', 'Europe/Berlin',
            'America/New_York', 'America/Chicago', 'America/Los_Angeles',
            'Australia/Sydney'
          ];
    const popularIds = new Set(this.popularZones.map(z => z.id));
    const others = allZones
      .filter(z => !popularIds.has(z))
      .sort((a, b) => a.localeCompare(b))
      .map(z => ({ id: z, label: z }));
    return [...this.popularZones, ...others];
  }

  themes = this.themeService.themes;

  iconStyles: Array<{ id: IconStyleId; name: string }> = [
    { id: 'outline', name: 'Outline' },
    { id: 'colorful', name: 'Colorful' },
    { id: 'awesome', name: 'Awesome' },
    { id: 'emoji', name: 'Emoji' },
    { id: 'soft', name: 'Soft' },
    { id: 'soft-colorful', name: 'Soft Colorful' },
    { id: 'awesome-colorful', name: 'Awesome Colorful' },
    { id: 'mono', name: 'Mono' },
  ];

  languages = [
    { code: 'en', name: '\u{1F1EC}\u{1F1E7} English' },
    { code: 'hi', name: '\u{1F1EE}\u{1F1F3} \u0939\u093F\u0928\u094D\u0926\u0940' },
    { code: 'mr', name: '\u{1F1EE}\u{1F1F3} \u092E\u0930\u093E\u0920\u0940' },
    { code: 'fr', name: '\u{1F1EB}\u{1F1F7} Fran\u00E7ais' },
    { code: 'zh', name: '\u{1F1E8}\u{1F1F3} \u4E2D\u6587' },
    { code: 'es', name: '\u{1F1EA}\u{1F1F8} Espa\u00F1ol' },
  ];

  ngOnInit() {
    this.currentTheme = this.themeService.initTheme();
    this.currentIconStyle = this.iconStyleService.init();
    this.emailNotifications = localStorage.getItem('im3_email_notif') !== 'false';
    this.browserNotifications = localStorage.getItem('im3_browser_notif') === 'true';
    this.language = this.translationService.getCurrentLang();

    const savedPos = (localStorage.getItem('im3_settings_sidebar_pos') || 'left')
      .toLowerCase();
    if (savedPos === 'right' || savedPos === 'top' || savedPos === 'bottom') {
      this.settingsSidebarPosition = savedPos;
    } else {
      this.settingsSidebarPosition = 'left';
    }

    const savedMainPos = (localStorage.getItem('im3_main_sidebar_pos') || 'left').toLowerCase();
    this.mainSidebarPosition = savedMainPos === 'bottom' ? 'bottom' : 'left';

    // Seed timezone from the org-context cache so the dropdown isn't empty
    // before the HTTP call returns.
    this.timezone = this.orgContext.timezone();
    this.loadGeneralOrgSettings();
  }

  /** Pull email-polling interval + timezone from the org record. */
  private loadGeneralOrgSettings() {
    this.http
      .get<any>(`${environment.apiUrl}/Organizations/current`)
      .subscribe({
        next: (org) => {
          const sec =
            typeof org?.emailPollingIntervalSeconds === 'number'
              ? org.emailPollingIntervalSeconds
              : 30;
          const { value, unit } = this.secondsToFriendly(sec);
          this.pollingIntervalValue = value;
          this.pollingIntervalUnit = unit;
          const tz = (org?.timezone || '').trim();
          if (tz) {
            this.timezone = tz;
            this.orgContext.setTimezone(tz);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          /* keep defaults */
        },
      });
  }

  /** Convert raw seconds to the friendliest (value, unit) pair for the UI. */
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
    const v = Math.max(1, Math.floor(Number(this.pollingIntervalValue) || 0));
    switch (this.pollingIntervalUnit) {
      case 'days': return v * 86400;
      case 'hours': return v * 3600;
      case 'minutes': return v * 60;
      default: return v;
    }
  }

  savePollingInterval() {
    const seconds = this.friendlyToSeconds();
    if (seconds < 5) {
      this.toastr.error('Minimum polling interval is 5 seconds.');
      return;
    }
    this.pollingSaving = true;
    this.http
      .put(`${environment.apiUrl}/Organizations/current`, {
        emailPollingIntervalSeconds: seconds,
      })
      .subscribe({
        next: () => {
          this.pollingSaving = false;
          this.toastr.success('Email polling interval updated.');
          this.cdr.detectChanges();
        },
        error: () => {
          this.pollingSaving = false;
          this.toastr.error('Could not save polling interval.');
          this.cdr.detectChanges();
        },
      });
  }

  saveTimezone() {
    if (!this.timezone) return;
    this.timezoneSaving = true;
    this.http
      .put(`${environment.apiUrl}/Organizations/current`, {
        timezone: this.timezone,
      })
      .subscribe({
        next: () => {
          this.timezoneSaving = false;
          this.orgContext.setTimezone(this.timezone);
          this.toastr.success(
            'Timezone updated — refreshing to apply everywhere…'
          );
          // Angular's built-in `date` pipe is pure, so views rendered
          // before the change won't pick up the new zone until they
          // re-mount. A one-time reload guarantees every screen across
          // the project (ticket detail, list, calendar, dashboards) is
          // immediately using the new timezone.
          setTimeout(() => window.location.reload(), 800);
        },
        error: () => {
          this.timezoneSaving = false;
          this.toastr.error('Could not save timezone.');
          this.cdr.detectChanges();
        },
      });
  }

  setSettingsSidebarPosition(pos: 'left' | 'right' | 'top' | 'bottom') {
    this.settingsSidebarPosition = pos;
    localStorage.setItem('im3_settings_sidebar_pos', pos);
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Layout updated!'));
  }

  setMainSidebarPosition(pos: 'left' | 'bottom') {
    this.mainSidebarPosition = pos;
    localStorage.setItem('im3_main_sidebar_pos', pos);
    window.dispatchEvent(new CustomEvent('im3-main-sidebar-pos', { detail: { pos } }));
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Main sidebar position updated!'));
  }

  applyTheme(themeId: string) {
    this.currentTheme = this.themeService.applyTheme(themeId);
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Theme applied!'));
  }

  applyIconStyle(iconStyleId: IconStyleId) {
    this.currentIconStyle = this.iconStyleService.apply(iconStyleId);
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Icon style applied!'));
  }

  saveNotifications() {
    localStorage.setItem('im3_email_notif', String(this.emailNotifications));
    localStorage.setItem('im3_browser_notif', String(this.browserNotifications));
    Promise.resolve().then(() => this.toastr.success('Notification settings saved!'));
  }

  saveLanguage() {
    this.translationService.setLanguage(this.language);
  }

  clearData() {
    if (!confirm('Clear all local data? You will be logged out.')) return;
    this.authService.logout();
  }

  logout() {
    this.authService.logout();
  }
}
