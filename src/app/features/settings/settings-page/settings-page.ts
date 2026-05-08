import { Component, OnInit, ChangeDetectorRef, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';
import { TranslationService } from '../../../services/translation'; // ✅ FIX: 'translation' not 'translation.service'
import { LayoutComponent } from '../../../shared/layout/layout';
import { TicketTemplatesComponent } from '../ticket-templates/ticket-templates';
import { EmailNotificationsComponent } from '../email-notifications/email-notifications';
import { AuditLogComponent } from '../audit-log/audit-log';
import { CustomFieldsComponent } from '../custom-fields/custom-fields';
import { WhatsappSettingsComponent } from '../whatsapp-settings/whatsapp-settings';
import { IntegrationsComponent } from '../integrations/integrations';
import { AgentGroupsSettingsComponent } from '../agent-groups-settings/agent-groups-settings';

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
    WhatsappSettingsComponent,
    IntegrationsComponent,
    AgentGroupsSettingsComponent
  ],
  templateUrl: './settings-page.html',
  styleUrls: ['./settings-page.scss']
})
export class SettingsPageComponent implements OnInit {
  private authService        = inject(AuthService);
  public  router             = inject(Router);
  private toastr             = inject(ToastrService);
  private cdr                = inject(ChangeDetectorRef);
  private translationService = inject(TranslationService); // ✅ FIX

  @Input() embedded: boolean = false;
  activeTab = 'settings';

  tabs = [
    { id: 'settings',      label: 'General Settings', icon: '🎨' },
    { id: 'notifications', label: 'Notifications',    icon: '🔔' },
    { id: 'templates',     label: 'Ticket Templates', icon: '📋' },
    { id: 'groups',        label: 'Agent Groups',     icon: '👥' },
    { id: 'custom-fields', label: 'Custom Fields',    icon: '⚙' },
    { id: 'audit',         label: 'Audit Log',        icon: '🔍' },
    { id: 'integrations',  label: 'Integrations',     icon: '🔗' },
    { id: 'whatsapp',      label: 'WhatsApp',         icon: '💬' },
  ];

  currentTheme         = 'theme-blue';
  emailNotifications   = true;
  browserNotifications = false;
  language             = 'en';

  themes = [
    { id: 'theme-blue',   name: 'Ocean Blue',    color: '#2563eb' },
    { id: 'theme-dark',   name: 'Dark Mode',     color: '#1a1a2e' },
    { id: 'theme-green',  name: 'Forest Green',  color: '#2e7d32' },
    { id: 'theme-purple', name: 'Royal Purple',  color: '#6a1b9a' },
    { id: 'theme-orange', name: 'Cosmic Orange', color: '#e85d04' },
    { id: 'theme-navy',   name: 'Midnight Navy', color: '#1e3a8a' },
    { id: 'theme-rose',   name: 'Rose Pink',     color: '#e11d48' },
    { id: 'theme-teal',   name: 'Arctic Teal',   color: '#0d9488' },  // ✅ NEW
    { id: 'theme-amber',  name: 'Golden Amber',  color: '#b45309' },  // ✅ NEW
    { id: 'theme-slate',  name: 'Carbon Slate',  color: '#334155' },  // ✅ NEW
  ];

  languages = [
    { code: 'en', name: '🇬🇧 English'  },
    { code: 'hi', name: '🇮🇳 हिन्दी'    },
    { code: 'mr', name: '🇮🇳 मराठी'    },
    { code: 'fr', name: '🇫🇷 Français' },
    { code: 'zh', name: '🇨🇳 中文'     },
    { code: 'es', name: '🇪🇸 Español'  },
  ];

  ngOnInit() {
    this.currentTheme         = localStorage.getItem('im3_theme')         || 'theme-blue';
    this.emailNotifications   = localStorage.getItem('im3_email_notif')   !== 'false';
    this.browserNotifications = localStorage.getItem('im3_browser_notif') === 'true';
    this.language             = this.translationService.getCurrentLang();  // ✅ FIX
  }

  applyTheme(themeId: string) {
    const all = this.themes.map(t => t.id);
    document.body.classList.remove(...all);
    document.body.classList.add(themeId);
    localStorage.setItem('im3_theme', themeId);
    this.currentTheme = themeId;
    this.cdr.detectChanges();
    Promise.resolve().then(() => this.toastr.success('Theme applied!'));
  }

  saveNotifications() {
    localStorage.setItem('im3_email_notif',   String(this.emailNotifications));
    localStorage.setItem('im3_browser_notif', String(this.browserNotifications));
    Promise.resolve().then(() => this.toastr.success('Notification settings saved!'));
  }

  // ✅ FIX: Ab translationService.setLanguage() use ho raha hai
  // Ye khud: langSignal update karega + localStorage set + reload karega
  saveLanguage() {
    this.translationService.setLanguage(this.language);
  }

  clearData() {
    if (!confirm('Clear all local data? You will be logged out.')) return;
    this.authService.logout();
  }

  logout() { this.authService.logout(); }
}