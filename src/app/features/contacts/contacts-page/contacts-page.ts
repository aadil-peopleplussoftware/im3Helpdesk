import {
  Component, OnInit,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../../services/auth.service';
import { LayoutComponent } from '../../../shared/layout/layout';

@Component({
  selector: 'app-contacts-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    RouterModule, LayoutComponent
  ],
  templateUrl: './contacts-page.html',
  styleUrls: ['./contacts-page.scss']
})
export class ContactsPageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  public router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  contacts: any[] = [];
  filteredContacts: any[] = [];
  loading = true;
  searchQuery = '';
  selectedContact: any = null;

  activeView: 'contacts' | 'companies' = 'contacts';
  companies: any[] = [];
  filteredCompanies: any[] = [];
  selectedCompany: any = null;
  companyContacts: any[] = [];

  private getHeaders() {
    return new HttpHeaders({
      'Authorization':
        `Bearer ${this.authService.getToken()}`
    });
  }


  coActiveTab = 'contacts';
  showCreateForm = false;

  viewContact(c: any) {
    this.selectedContact = c;
    this.activeView = 'contacts';
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.loadContacts();
    this.loadCompanies();
  }

  loadContacts() {
    this.loading = true;
    this.http.get<any[]>(
      'https://localhost:7071/api/Contacts',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.contacts = data;
        this.filteredContacts = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  search() {
    const q = this.searchQuery.toLowerCase();
    this.filteredContacts = q
      ? this.contacts.filter(c =>
          c.fullName?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q))
      : [...this.contacts];
    this.cdr.detectChanges();
  }

  get companyGroups(): any[] {
  const groups: { [key: string]: any[] } = {};
  this.filteredContacts.forEach(c => {
    const company = c.company || 'No Company';
    if (!groups[company]) groups[company] = [];
    groups[company].push(c);
  });
  return Object.entries(groups)
    .map(([name, contacts]) => ({ name, contacts }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

  loadCompanies() {
    this.http.get<any[]>(
      'https://localhost:7071/api/Contacts',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        const groups: any = {};
        data.forEach(c => {
          const co = c.company || 'No Company';
          if (!groups[co]) {
            groups[co] = { name: co, contacts: [] };
          }
          groups[co].contacts.push(c);
        });
        this.companies = Object.values(groups)
          .sort((a: any, b: any) =>
            a.name.localeCompare(b.name));
        this.filteredCompanies = [...this.companies];
        this.cdr.detectChanges();
      }
    });
  }

  selectCompany(co: any) {
    this.selectedCompany = co;
    this.companyContacts = co.contacts;
    this.cdr.detectChanges();
  }

  searchCompanies() {
    const q = this.searchQuery.toLowerCase();
    this.filteredCompanies = q
      ? this.companies.filter(
          (c: any) => c.name.toLowerCase().includes(q))
      : [...this.companies];
    this.cdr.detectChanges();
  }

  selectContact(c: any) {
    this.selectedContact =
      this.selectedContact?.id === c.id ? null : c;
    this.cdr.detectChanges();
  }

  getAvatarColor(name: string): string {
    const colors = [
      '#ef4444','#f97316','#eab308',
      '#22c55e','#3b82f6','#8b5cf6','#ec4899'
    ];
    const idx = (name?.charCodeAt(0) || 0)
      % colors.length;
    return colors[idx];
  }

  getInitials(name: string): string {
    return name?.split(' ')
      .map(n => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  }
}