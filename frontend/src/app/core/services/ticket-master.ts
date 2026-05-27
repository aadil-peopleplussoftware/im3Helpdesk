import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type TicketMasterField = 'TicketType' | 'TicketStatus' | 'TicketPriority';

export interface TicketMasterOption {
  id: string;
  field: TicketMasterField;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TicketMasterGroupResponse {
  ticketTypes: TicketMasterOption[];
  ticketStatuses: TicketMasterOption[];
  ticketPriorities: TicketMasterOption[];
}

@Injectable({ providedIn: 'root' })
export class TicketMasterService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/TicketMasters`;

  getAll(activeOnly: boolean = true): Observable<TicketMasterGroupResponse> {
    return this.http.get<TicketMasterGroupResponse>(`${this.apiUrl}/all`, {
      params: { activeOnly }
    });
  }

  getByField(field: TicketMasterField, activeOnly: boolean = false): Observable<TicketMasterOption[]> {
    return this.http.get<TicketMasterOption[]>(`${this.apiUrl}/field/${field}`, {
      params: { activeOnly }
    });
  }

  create(data: {
    field: TicketMasterField;
    value: string;
    label?: string;
    sortOrder?: number;
  }): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  update(id: string, data: {
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  }): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  hardDelete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}/hard`);
  }
}
