import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-contacts-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LayoutComponent],
  templateUrl: './contacts-page.html',
  styleUrls: ['./contacts-page.scss']
})
export class ContactsPageComponent implements OnInit {
  private http = inject(HttpClient);
  public router = inject(Router);
  private route = inject(ActivatedRoute);
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
  coActiveTab = 'contacts';

  private pendingContactId: string | null = null;
  private pendingQuery: string | null = null;

  ngOnInit() {
    this.pendingContactId = this.route.snapshot.queryParamMap.get('contactId');
    this.pendingQuery = this.route.snapshot.queryParamMap.get('q');
    this.loadContacts();
    this.loadCompanies();
  }

  loadContacts() {
    this.loading = true;
    this.http.get<any[]>(`${environment.apiUrl}/Contacts`).subscribe({
      next: (data) => {
        this.contacts = data;
        this.buildFilteredContacts(data);

        if (this.pendingQuery) {
          this.searchQuery = this.pendingQuery;
          this.search();
        }

        if (this.pendingContactId) {
          const found = this.contacts.find(c => c.id === this.pendingContactId);
          if (found) {
            this.activeView = 'contacts';
            this.selectedContact = found;
          }
        }

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; }
    });
  }

  buildFilteredContacts(data: any[]) {
    const sorted = [...data].sort((a,b) => a.fullName.localeCompare(b.fullName));
    const groups: { [key: string]: any[] } = {};
    
    sorted.forEach(c => {
      const letter = c.fullName?.charAt(0)?.toUpperCase() || '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    });

    this.filteredContacts = Object.entries(groups).map(([letter, list]) => ({ letter, contacts: list }));
  }

  search() {
    const q = this.searchQuery.toLowerCase().trim();
    if (this.activeView === 'contacts') {
      if (!q) {
        this.buildFilteredContacts(this.contacts);
      } else {
        // Match by name, email or company so an inbound nav like
        // `/contacts?q=<email>` from a ticket profile click resolves
        // the right person instead of returning a blank list.
        const matches = this.contacts.filter(c =>
          (c.fullName && c.fullName.toLowerCase().includes(q)) ||
          (c.email    && c.email.toLowerCase().includes(q)) ||
          (c.company  && c.company.toLowerCase().includes(q)));
        this.buildFilteredContacts(matches);
      }
    } else {
      if (!q) {
        this.filteredCompanies = [...this.companies];
      } else {
        this.filteredCompanies = this.companies.filter(co => co.name.toLowerCase().includes(q));
      }
    }
    this.cdr.detectChanges();
  }

  loadCompanies() {
    this.http.get<any[]>(`${environment.apiUrl}/Contacts`).subscribe({
      next: (data) => {
        const groups: any = {};
        data.forEach(c => {
          const co = c.company || 'No Company';
          if (!groups[co]) {
            groups[co] = { name: co, contacts: [] };
          }
          groups[co].contacts.push(c);
        });
        this.companies = Object.values(groups).sort((a: any, b: any) => a.name.localeCompare(b.name));
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

  selectContact(c: any) {
    this.selectedContact = this.selectedContact?.id === c.id ? null : c;
    this.cdr.detectChanges();
  }

  getAvatarColor(name: string): string {
    const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
    return colors[(name?.charCodeAt(0) || 0) % colors.length];
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);
  }
}