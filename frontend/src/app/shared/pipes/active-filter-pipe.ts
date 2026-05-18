import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'activeFilter',
  standalone: true
})
export class ActiveFilterPipe implements PipeTransform {
  transform(items: any[]): number {
    if (!items) return 0;
    return items.filter(i => i.isActive).length;
  }
}