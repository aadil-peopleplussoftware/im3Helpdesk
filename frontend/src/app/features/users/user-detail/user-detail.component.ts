import { CommonModule, Location } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AgentService } from '../../../core/services/agent';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, LayoutComponent],
  templateUrl: './user-detail.component.html',
  styleUrls: ['./user-detail.component.scss']
})
export class UserDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private agentService = inject(AgentService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  loading = true;
  user: any = null;
  readonly baseUrl = environment.baseUrl;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const id = (params.get('id') || '').trim();
        if (!id) {
          this.loading = false;
          this.cdr.detectChanges();
          this.router.navigate(['/users']);
          return;
        }
        this.fetchUser(id);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    this.router.navigate(['/users']);
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    const first = parts[0]?.charAt(0) || '';
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + second).toUpperCase();
  }

  profilePhotoUrl(): string {
    const raw = String(this.user?.photoUrl || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${this.baseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  private fetchUser(id: string): void {
    this.loading = true;
    this.cdr.detectChanges();

    this.agentService.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.user = res;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.cdr.detectChanges();
          this.toastr.error('User profile could not be loaded.');
          this.router.navigate(['/users']);
        }
      });
  }
}
