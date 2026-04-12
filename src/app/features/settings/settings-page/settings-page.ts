import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';
import { LayoutComponent } from '../../../shared/layout/layout';
import { TicketTemplatesComponent } from '../ticket-templates/ticket-templates';
import { EmailNotificationsComponent } from '../email-notifications/email-notifications';
import { AuditLogComponent } from '../audit-log/audit-log';
import { ReportsPageComponent } from '../../reports/reports-page/reports-page';
import { CustomFieldsComponent } from '../custom-fields/custom-fields';

// imports array:


@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatDividerModule, MatSlideToggleModule,
    LayoutComponent,
    TicketTemplatesComponent,
    EmailNotificationsComponent,
    AuditLogComponent,
    ReportsPageComponent,CustomFieldsComponent
  ],
  templateUrl: './settings-page.html',
  styleUrls: ['./settings-page.scss']
})
export class SettingsPageComponent implements OnInit {
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  activeTab = 'settings';
  currentTheme = 'theme-blue';
  emailNotifications = true;
  browserNotifications = false;
  language = 'en';

  tabs = [
    { id: 'templates', label: 'Ticket Templates', icon: '📋' },
    { id: 'custom-fields', label: 'Custom Fields', icon: '⚙' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '🎨' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'audit', label: 'Audit Log', icon: '🔍' },
  ];

  themes = [
    { id: 'theme-blue', name: 'Ocean Blue', color: '#2563eb' },
    { id: 'theme-dark', name: 'Dark Mode', color: '#1a1a2e' },
    { id: 'theme-green', name: 'Forest Green', color: '#2e7d32' },
    { id: 'theme-purple', name: 'Royal Purple', color: '#6a1b9a' }
  ];

  languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'mr', name: 'Marathi' }
  ];

  ngOnInit() {
    this.currentTheme =
      localStorage.getItem('im3_theme') || 'theme-blue';
    this.emailNotifications =
      localStorage.getItem('im3_email_notif') !== 'false';
    this.browserNotifications =
      localStorage.getItem('im3_browser_notif') === 'true';
    this.language =
      localStorage.getItem('im3_lang') || 'en';
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
    localStorage.setItem('im3_email_notif',
      this.emailNotifications.toString());
    localStorage.setItem('im3_browser_notif',
      this.browserNotifications.toString());
    Promise.resolve().then(() =>
      this.toastr.success('Saved!')
    );
  }

  saveLanguage() {
    localStorage.setItem('im3_lang', this.language);
    Promise.resolve().then(() =>
      this.toastr.success('Language saved! Reloading...')
    );
    setTimeout(() => window.location.reload(), 800);
  }

  clearData() {
    if (!confirm('Clear all local data? You will be logged out.'))
      return;
    this.authService.logout();
  }

  logout() { this.authService.logout(); }
}