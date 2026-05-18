import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './verify-email.html',
  styleUrls: ['./verify-email.scss']
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private http   = inject(HttpClient);
  private cdr    = inject(ChangeDetectorRef);

  status: 'loading' | 'success' | 'error' = 'loading';
  errorMessage = 'Invalid or expired verification link.';
  countdown    = 5;
  private _timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.status = 'error';
      this.errorMessage = 'No verification token found.';
      this.cdr.detectChanges();
      return;
    }

    this.http.get(
      `${environment.apiUrl}/Auth/verify-email?token=${token}`
    ).subscribe({
      next: () => {
        this.status = 'success';
        this.cdr.detectChanges();   // ✅ UI turant update
        this.startCountdown();
      },
      error: (err) => {
        this.status       = 'error';
        this.errorMessage =
          err.error?.message ||
          'Verification failed. Link may be expired.';
        this.cdr.detectChanges();   // ✅ UI turant update
      }
    });
  }

  private startCountdown() {
    this._timer = setInterval(() => {
      this.countdown--;
      this.cdr.detectChanges();     // ✅ Countdown UI mein dikhega
      if (this.countdown <= 0) {
        clearInterval(this._timer!);
        this._timer = null;
        this.router.navigate(['/login']);
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this._timer) clearInterval(this._timer);
  }
}