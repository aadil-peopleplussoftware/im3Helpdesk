import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';

@Pipe({
  name: 'localDate',
  standalone: true
})
export class LocalDatePipe implements PipeTransform {
  private datePipe = new DatePipe('en-IN');

  transform(
    value: string | Date | null | undefined,
    format: string = 'EEE, dd MMM yyyy, hh:mm a',
    timezone: string = 'Asia/Kolkata'
  ): string {
    if (!value) return '';
    return this.datePipe.transform(value, format, timezone) ?? '';
  }
}