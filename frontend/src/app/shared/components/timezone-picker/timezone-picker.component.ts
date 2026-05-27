import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  forwardRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  TIMEZONE_OPTIONS,
  TimezoneOption,
  getGmtOffset,
  getOffsetMinutes
} from '../../timezone-options';

interface DisplayOption extends TimezoneOption {
  offset: string;       // "GMT+05:30"
  offsetMins: number;   // 330
  label: string;        // "(GMT+05:30) Kolkata"
  searchKey: string;    // lowercase haystack for filtering
}

/**
 * Searchable, Rails-style timezone combobox.
 *
 *   <app-timezone-picker [(ngModel)]="orgTz"></app-timezone-picker>
 *
 * - Persists the canonical IANA value so the rest of the project (date
 *   pipe, calendars, polling cutoff) keeps working unchanged.
 * - Displays a live "(GMT+HH:MM) City" label calculated via
 *   `Intl.DateTimeFormat`, so DST changes are reflected automatically.
 * - Built-in fuzzy substring filter over the city name, the IANA id and
 *   the offset string, so a user can type "kol", "+05:30" or
 *   "asia/kol" and reach Kolkata.
 */
@Component({
  selector: 'app-timezone-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimezonePickerComponent),
      multi: true
    }
  ],
  templateUrl: './timezone-picker.component.html',
  styleUrls: ['./timezone-picker.component.scss']
})
export class TimezonePickerComponent implements ControlValueAccessor {
  private cdr = inject(ChangeDetectorRef);
  private host = inject(ElementRef<HTMLElement>);

  @Input() placeholder = 'Select timezone\u2026';
  @Input() disabled = false;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  /** Full option list, decorated with the live GMT offset / search key. */
  readonly allOptions: DisplayOption[] = this.buildOptions();

  /** Options visible after the current search filter is applied. */
  filteredOptions: DisplayOption[] = this.allOptions;

  /** Current ngModel value (IANA id). */
  value: string | null = null;

  /** Label shown inside the closed combobox. */
  selectedLabel = '';

  open = false;
  query = '';
  highlightedIdx = -1;

  // CVA hooks
  private onChange: (v: string | null) => void = () => { /* no-op */ };
  private onTouched: () => void = () => { /* no-op */ };

  // \u2500\u2500 ControlValueAccessor \u2500\u2500
  writeValue(value: string | null): void {
    this.value = value;
    this.selectedLabel = this.labelFor(value);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (v: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  // \u2500\u2500 UI \u2500\u2500
  toggleOpen(force?: boolean): void {
    if (this.disabled) return;
    const next = force !== undefined ? force : !this.open;
    this.open = next;
    if (this.open) {
      this.query = '';
      this.applyFilter();
      this.highlightedIdx = this.filteredOptions.findIndex(
        (o) => o.iana === this.value
      );
      // Focus the search input on next tick.
      setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    } else {
      this.onTouched();
    }
    this.cdr.markForCheck();
  }

  onQueryChange(q: string): void {
    this.query = q;
    this.applyFilter();
    this.highlightedIdx = this.filteredOptions.length > 0 ? 0 : -1;
    this.cdr.markForCheck();
  }

  select(opt: DisplayOption): void {
    this.value = opt.iana;
    this.selectedLabel = opt.label;
    this.onChange(opt.iana);
    this.toggleOpen(false);
  }

  onKeydown(ev: KeyboardEvent): void {
    if (!this.open) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      this.highlightedIdx = Math.min(
        this.highlightedIdx + 1,
        this.filteredOptions.length - 1
      );
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.highlightedIdx = Math.max(this.highlightedIdx - 1, 0);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const opt = this.filteredOptions[this.highlightedIdx];
      if (opt) this.select(opt);
    } else if (ev.key === 'Escape') {
      this.toggleOpen(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.open) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.toggleOpen(false);
    }
  }

  trackByIana = (_: number, o: DisplayOption) => o.iana;

  // \u2500\u2500 Helpers \u2500\u2500
  private applyFilter(): void {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.filteredOptions = this.allOptions;
      return;
    }
    this.filteredOptions = this.allOptions.filter((o) =>
      o.searchKey.includes(q)
    );
  }

  private labelFor(iana: string | null): string {
    if (!iana) return '';
    const direct = this.allOptions.find((o) => o.iana === iana);
    if (direct) return direct.label;
    // Fallback: surface unknown IANA verbatim with a live offset.
    const off = getGmtOffset(iana);
    return `(${off}) ${iana}`;
  }

  private buildOptions(): DisplayOption[] {
    const now = new Date();
    const decorated: DisplayOption[] = TIMEZONE_OPTIONS.map((o) => {
      const offset = getGmtOffset(o.iana, now);
      const label = `(${offset}) ${o.city}`;
      return {
        ...o,
        offset,
        offsetMins: getOffsetMinutes(o.iana, now),
        label,
        searchKey: `${o.city} ${o.iana} ${offset}`.toLowerCase()
      };
    });
    // Sort West \u2192 East to mirror the Rails reference list.
    decorated.sort((a, b) => {
      if (a.offsetMins !== b.offsetMins) return a.offsetMins - b.offsetMins;
      return a.city.localeCompare(b.city);
    });
    return decorated;
  }
}
