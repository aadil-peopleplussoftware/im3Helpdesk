import { Component, OnInit, ChangeDetectorRef, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { TranslationService } from '../../../core/services/translation';
import { ThemeService } from '../../../core/services/theme.service';
import { IconStyleId, IconStyleService } from '../../../core/services/icon-style.service';
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

  @Input() embedded: boolean = false;
  activeTab = 'settings';

  tabs = [
    { id: 'settings', label: 'General Settings', icon: '\u{1F3A8}' },
    { id: 'notifications', label: 'Notifications', icon: '\u{1F514}' },
    { id: 'templates', label: 'Ticket Templates', icon: '\u{1F4CB}' },
    { id: 'groups', label: 'Agent Groups', icon: '\u{1F465}' },
    { id: 'custom-fields', label: 'Custom Fields', icon: '\u2699' },
    { id: 'ticket-masters', label: 'Ticket Masters', icon: '\u{1F4CA}' },
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
  }

  setSettingsSidebarPosition(pos: 'left' | 'right' | 'top' | 'bottom') {
    this.settingsSidebarPosition = pos;
    localStorage.setItem('im3_settings_sidebar_pos', pos);
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Layout updated!'));
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
