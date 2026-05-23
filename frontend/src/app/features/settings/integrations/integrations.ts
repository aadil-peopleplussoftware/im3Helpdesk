import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './integrations.html',
  styleUrls: ['./integrations.scss']
})
export class IntegrationsComponent implements OnInit {
  private http = inject(HttpClient);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  slackWebhookUrl = '';
  teamsWebhookUrl = '';
  saving = false;
  testFromEmail = '';
  testFromName = '';
  testToEmail = '';
  testSubject = '';
  testBody = '';
  emailTestResult = '';
  organizationId = '';

simulateEmail() {
  if (!this.testFromEmail || !this.testToEmail) {
    Promise.resolve().then(() =>
      this.toastr.error('From email and To email required')
    );
    return;
  }

  this.http.post<any>(
    `${environment.apiUrl}/InboundEmail/simulate`,
    {
      fromEmail: this.testFromEmail,
      fromName: this.testFromName,
      toEmail: this.testToEmail,
      subject: this.testSubject,
      body: this.testBody
    }
  ).subscribe({
    next: (res) => {
      this.emailTestResult =
        `Ticket created: "${res.ticketTitle}" for ${res.customer}`;
      Promise.resolve().then(() =>
        this.toastr.success('Email converted to ticket!')
      );
    },
    error: (err) => {
      this.emailTestResult =
        err.error?.message || 'Failed';
      Promise.resolve().then(() =>
        this.toastr.error('Failed: ' + this.emailTestResult)
      );
    }
  });
}
  ngOnInit() {
    this.http.get<any>(`${environment.apiUrl}/Organizations/current`).subscribe({
      next: (data) => {
        this.organizationId = data.id || data.organizationId || '';
        this.slackWebhookUrl = data.slackWebhookUrl || '';
        this.teamsWebhookUrl = data.teamsWebhookUrl || '';
        this.cdr.detectChanges();
      }
    });
  }

  saveSlack() {
    this.saving = true;
    this.http.put(
      `${environment.apiUrl}/Organizations/current`,
      { slackWebhookUrl: this.slackWebhookUrl }
    ).subscribe({
      next: () => {
        this.saving = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Slack configured!')
        );
      }
    });
  }

  saveTeams() {
    this.saving = true;
    this.http.put(
      `${environment.apiUrl}/Organizations/current`,
      { teamsWebhookUrl: this.teamsWebhookUrl }
    ).subscribe({
      next: () => {
        this.saving = false;
        this.cdr.detectChanges();
        Promise.resolve().then(() =>
          this.toastr.success('Teams configured!')
        );
      }
    });
  }

  testSlack() {
    if (!this.organizationId) {
      Promise.resolve().then(() =>
        this.toastr.error('Organization context not found.')
      );
      return;
    }

    this.http.post(
      `${environment.apiUrl}/Slack/notify`,
      {
        orgId: this.organizationId,
        message: 'Test notification from iM3 Helpdesk!',
        ticketTitle: 'Test Ticket',
        status: 'Open'
      }
    ).subscribe({
      next: () =>
        Promise.resolve().then(() =>
          this.toastr.success('Test sent to Slack!')
        ),
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed. Check webhook URL.')
        )
    });
  }

  testTeams() {
    if (!this.organizationId) {
      Promise.resolve().then(() =>
        this.toastr.error('Organization context not found.')
      );
      return;
    }

    this.http.post(
      `${environment.apiUrl}/Slack/teams/notify`,
      {
        orgId: this.organizationId,
        message: 'Test notification from iM3 Helpdesk!',
        ticketTitle: 'Test Ticket',
        status: 'Open'
      }
    ).subscribe({
      next: () =>
        Promise.resolve().then(() =>
          this.toastr.success('Test sent to Teams!')
        ),
      error: () =>
        Promise.resolve().then(() =>
          this.toastr.error('Failed. Check webhook URL.')
        )
    });
  }
}