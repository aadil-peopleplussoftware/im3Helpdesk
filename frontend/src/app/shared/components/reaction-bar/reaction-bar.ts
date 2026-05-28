import {
  Component, Input, ChangeDetectionStrategy,
  ChangeDetectorRef, inject, HostListener, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactionService, ReactionKey } from './reaction.service';

interface ReactionDef {
  key: ReactionKey;
  emoji: string;
  label: string;
}

/**
 * Microsoft Teams-style reaction bar.
 *
 * Usage:
 *   <app-reaction-bar [targetId]="c.id"></app-reaction-bar>
 *
 * Behavior:
 *  - Hover the bar → 6-emoji picker fades in (like Teams).
 *  - Click an emoji → toggles the current user's reaction.
 *    Only one reaction per user per target (clicking again removes it).
 *  - Existing reactions render as small chips with count.
 *  - Persistence: localStorage today via {@link ReactionService}; can be
 *    swapped to an HTTP backend by changing only that service.
 */
@Component({
  selector: 'app-reaction-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './reaction-bar.html',
  styleUrls: ['./reaction-bar.scss']
})
export class ReactionBarComponent {
  private svc = inject(ReactionService);
  private cdr = inject(ChangeDetectorRef);
  private host = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) targetId!: string | number;

  /** Compact mode hides the trigger button until hover (Teams-like). */
  @Input() compact = true;

  readonly reactions: ReactionDef[] = [
    { key: 'like',    emoji: '👍', label: 'Like' },
    { key: 'heart',   emoji: '❤️', label: 'Heart' },
    { key: 'laugh',   emoji: '😄', label: 'Laugh' },
    { key: 'wow',     emoji: '😮', label: 'Wow' },
    { key: 'sad',     emoji: '😢', label: 'Sad' },
    { key: 'dislike', emoji: '👎', label: 'Dislike' },
  ];

  pickerOpen = false;

  get targetKey(): string {
    return String(this.targetId);
  }

  /** Reactions chip list (key → count) for this target. */
  get summary(): Array<{ key: ReactionKey; emoji: string; count: number; mine: boolean }> {
    const counts = this.svc.getCounts(this.targetKey);
    const mine = this.svc.getMyReaction(this.targetKey);
    return this.reactions
      .filter(r => (counts[r.key] ?? 0) > 0)
      .map(r => ({
        key: r.key,
        emoji: r.emoji,
        count: counts[r.key] ?? 0,
        mine: mine === r.key,
      }));
  }

  togglePicker(ev: MouseEvent): void {
    ev.stopPropagation();
    this.pickerOpen = !this.pickerOpen;
  }

  openPicker(): void {
    this.pickerOpen = true;
  }

  closePicker(): void {
    this.pickerOpen = false;
  }

  pick(r: ReactionDef, ev: MouseEvent): void {
    ev.stopPropagation();
    this.svc.toggle(this.targetKey, r.key);
    this.pickerOpen = false;
    this.cdr.markForCheck();
  }

  /** Click an existing chip to remove your reaction (if it was yours). */
  toggleChip(key: ReactionKey, ev: MouseEvent): void {
    ev.stopPropagation();
    this.svc.toggle(this.targetKey, key);
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.pickerOpen) return;
    if (!this.host.nativeElement.contains(ev.target as Node)) {
      this.pickerOpen = false;
      this.cdr.markForCheck();
    }
  }
}
