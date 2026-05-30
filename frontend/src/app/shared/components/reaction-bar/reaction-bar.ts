import {
  Component, Input, OnInit, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef, inject, ElementRef, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactionService, ReactionKey, ReactionState } from './reaction.service';

interface ReactionDef {
  key: ReactionKey;
  emoji: string;
  label: string;
}

/**
 * Microsoft Teams-style reaction bar.
 *
 * Reactions are stored in the backend DB and are visible to all users.
 *
 * Usage:
 *   <app-reaction-bar [targetId]="c.id"></app-reaction-bar>
 */
@Component({
  selector: 'app-reaction-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './reaction-bar.html',
  styleUrls: ['./reaction-bar.scss']
})
export class ReactionBarComponent implements OnInit, OnChanges {
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

  private counts: Partial<Record<ReactionKey, number>> = {};
  private myReaction: ReactionKey | null = null;

  get targetKey(): string {
    return String(this.targetId);
  }

  ngOnInit(): void {
    this.loadReactions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['targetId'] && !changes['targetId'].firstChange) {
      this.counts = {};
      this.myReaction = null;
      this.loadReactions();
    }
  }

  private loadReactions(): void {
    if (!this.targetId) return;
    this.svc.load(this.targetKey).subscribe({
      next: (state: ReactionState) => {
        this.counts = state.counts;
        this.myReaction = state.myReaction;
        this.cdr.markForCheck();
      },
      error: () => { /* non-critical — leave counts empty */ }
    });
  }

  private applyState(state: ReactionState): void {
    this.counts = state.counts;
    this.myReaction = state.myReaction;
    this.cdr.markForCheck();
  }

  /** Reactions chip list (key → count) for this target. */
  get summary(): Array<{ key: ReactionKey; emoji: string; count: number; mine: boolean }> {
    return this.reactions
      .filter(r => (this.counts[r.key] ?? 0) > 0)
      .map(r => ({
        key: r.key,
        emoji: r.emoji,
        count: this.counts[r.key] ?? 0,
        mine: this.myReaction === r.key,
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
    this.pickerOpen = false;
    this.svc.toggle(this.targetKey, r.key).subscribe({
      next: state => this.applyState(state),
      error: () => { /* keep current state on error */ }
    });
  }

  /** Click an existing chip to remove your reaction (if it was yours). */
  toggleChip(key: ReactionKey, ev: MouseEvent): void {
    ev.stopPropagation();
    this.svc.toggle(this.targetKey, key).subscribe({
      next: state => this.applyState(state),
      error: () => { /* keep current state on error */ }
    });
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
