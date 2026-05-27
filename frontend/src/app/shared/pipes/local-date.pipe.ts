import { Pipe, PipeTransform, LOCALE_ID, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { OrgContextService } from '../../core/services/org-context.service';

@Pipe({
  name: 'localDate',
  standalone: true,
  // pure: false so the pipe re-runs when the org timezone signal changes.
  pure: false
})
export class LocalDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);
  private readonly orgContext = inject(OrgContextService);
  private readonly datePipe = new DatePipe(this.locale);

  transform(
    value: string | Date | null | undefined,
    format: string = 'EEE, dd MMM yyyy, hh:mm a',
    timezone?: string
  ): string {
    if (!value) return '';
    const tz = timezone || this.orgContext.timezone();
    return this.datePipe.transform(value, format, tz) ?? '';
  }
}