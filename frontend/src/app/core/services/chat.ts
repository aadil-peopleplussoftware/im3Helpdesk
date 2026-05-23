import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable()
export class ChatService {
  private hubConnection!: signalR.HubConnection;
  private messageSubject = new BehaviorSubject<any[]>([]);
  private newTicketSubject = new BehaviorSubject<any>(null);

  messages$ = this.messageSubject.asObservable();
  newTicket$ = this.newTicketSubject.asObservable();

  constructor() {}

  connect(): Promise<void> {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.baseUrl}/hubs/chat`, {
        withCredentials: true
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('ReceiveMessage', (msg: any) => {
      const current = this.messageSubject.getValue();
      this.messageSubject.next([...current, msg]);
    });

    this.hubConnection.on('NewTicket', (ticket: any) => {
      this.newTicketSubject.next(ticket);
    });

    return this.hubConnection.start();
  }

  joinTicketRoom(ticketId: string): Promise<void> {
    return this.hubConnection.invoke('JoinTicketRoom', ticketId);
  }

  leaveTicketRoom(ticketId: string): Promise<void> {
    return this.hubConnection.invoke('LeaveTicketRoom', ticketId);
  }

  sendMessage(ticketId: string, message: string,
    senderName: string, isAgent: boolean): Promise<void> {
    return this.hubConnection.invoke(
      'SendMessage', ticketId, message, senderName, isAgent);
  }

  joinOrgRoom(orgId: string): Promise<void> {
    return this.hubConnection.invoke('JoinOrgRoom', orgId);
  }

  clearMessages() {
    this.messageSubject.next([]);
  }

  disconnect(): Promise<void> {
    if (this.hubConnection) {
      return this.hubConnection.stop();
    }
    return Promise.resolve();
  }

  get isConnected(): boolean {
    return this.hubConnection?.state
      === signalR.HubConnectionState.Connected;
  }
}
