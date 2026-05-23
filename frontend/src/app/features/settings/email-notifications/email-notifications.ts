import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';

interface NotifSetting {
  key: string;
  label: string;
  enabled: boolean;
  tab: 'agent' | 'requester' | 'cc';
}

@Component({
  selector: 'app-email-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-notifications.html',
  styleUrls: ['./email-notifications.scss']
})
export class EmailNotificationsComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  activeTab: 'agent' | 'requester' | 'cc' = 'agent';

  agentNotifications: NotifSetting[] = [
    { key: 'newTicketCreated', label: 'New Ticket Created',
      enabled: true, tab: 'agent' },
    { key: 'ticketAssignedGroup', label: 'Ticket Assigned to Group',
      enabled: true, tab: 'agent' },
    { key: 'ticketAssignedAgent', label: 'Ticket Assigned to Agent',
      enabled: true, tab: 'agent' },
    { key: 'requesterReplies', label: 'Requester Replies to Ticket',
      enabled: true, tab: 'agent' },
    { key: 'ticketUnattended', label: 'Ticket Unattended in Group',
      enabled: true, tab: 'agent' },
    { key: 'firstResponseSlaViolation', label: 'First Response SLA Violation',
      enabled: true, tab: 'agent' },
    { key: 'resolutionSlaViolation', label: 'Resolution Time SLA Violation',
      enabled: true, tab: 'agent' },
    { key: 'noteAdded', label: 'Note added to ticket',
      enabled: true, tab: 'agent' },
    { key: 'firstResponseReminder', label: 'First Response SLA Reminder',
      enabled: true, tab: 'agent' },
    { key: 'resolutionReminder', label: 'Resolution Time SLA Reminder',
      enabled: true, tab: 'agent' },
  ];

  requesterNotifications: NotifSetting[] = [
    { key: 'ticketCreatedConfirm', label: 'Ticket Created Confirmation',
      enabled: true, tab: 'requester' },
    { key: 'ticketStatusChanged', label: 'Ticket Status Changed',
      enabled: true, tab: 'requester' },
    { key: 'agentReplied', label: 'Agent Replied to Ticket',
      enabled: true, tab: 'requester' },
    { key: 'ticketResolved', label: 'Ticket Resolved',
      enabled: true, tab: 'requester' },
    { key: 'ticketClosed', label: 'Ticket Closed',
      enabled: true, tab: 'requester' },
  ];

  ccNotifications: NotifSetting[] = [
    { key: 'ccNewTicket', label: 'New Ticket Created',
      enabled: false, tab: 'cc' },
    { key: 'ccReply', label: 'Reply Added to Ticket',
      enabled: false, tab: 'cc' },
    { key: 'ccResolved', label: 'Ticket Resolved',
      enabled: false, tab: 'cc' },
  ];

  ngOnInit() {
    const saved = localStorage.getItem('im3_notif_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      this.agentNotifications.forEach(n => {
        if (settings[n.key] !== undefined)
          n.enabled = settings[n.key];
      });
      this.requesterNotifications.forEach(n => {
        if (settings[n.key] !== undefined)
          n.enabled = settings[n.key];
      });
      this.ccNotifications.forEach(n => {
        if (settings[n.key] !== undefined)
          n.enabled = settings[n.key];
      });
    }
  }

  saveSettings() {
    const all = [
      ...this.agentNotifications,
      ...this.requesterNotifications,
      ...this.ccNotifications
    ];

    // Save to localStorage
    const settings: any = {};
    all.forEach(n => settings[n.key] = n.enabled);
    localStorage.setItem('im3_notif_settings', JSON.stringify(settings));

    // Save to backend
    const payload = all.map(n => ({
      notifKey: n.key,
      isEnabled: n.enabled
    }));

    this.http.post(
      `${environment.apiUrl}/EmailNotificationSettings`,
      payload
    ).subscribe({
      next: () =>
        Promise.resolve().then(() =>
          this.toastr.success('Notification settings saved!')
        )
    });
  }

  get activeNotifications(): NotifSetting[] {
    if (this.activeTab === 'agent') return this.agentNotifications;
    if (this.activeTab === 'requester') return this.requesterNotifications;
    return this.ccNotifications;
  }
}