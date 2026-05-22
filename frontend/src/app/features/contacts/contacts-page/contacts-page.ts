import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
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
  coActiveTab = 'contacts';

  ngOnInit() {
    this.loadContacts();
    this.loadCompanies();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
  }

  loadContacts() {
    this.loading = true;
    this.http.get<any[]>(`${environment.apiUrl}/Contacts`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.contacts = data;
        this.buildFilteredContacts(data);
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
        const matches = this.contacts.filter(c => c.fullName.toLowerCase().includes(q) || (c.company && c.company.toLowerCase().includes(q)));
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
    this.http.get<any[]>(`${environment.apiUrl}/Contacts`, { headers: this.getHeaders() }).subscribe({
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