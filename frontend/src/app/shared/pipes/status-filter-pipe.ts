import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'statusFilter',
  standalone: true
})
export class StatusFilterPipe implements PipeTransform {
  transform(tickets: any[], status: string): number {
    if (!tickets) return 0;
    return tickets.filter(t => t.status === status).length;
  }
}