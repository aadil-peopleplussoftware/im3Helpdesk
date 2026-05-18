import {
  Component, ChangeDetectorRef, inject,
  OnDestroy, AfterViewInit, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder,
  FormGroup, Validators
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../auth.service';

type LoginStep = 'credentials' | 'otp' | 'success';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class LoginComponent implements OnDestroy, AfterViewInit {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private toastr      = inject(ToastrService);
  private fb          = inject(FormBuilder);
  private cdr         = inject(ChangeDetectorRef);

  // ── OTP container reference ────────────────
  @ViewChild('otpContainer')
  otpContainer!: ElementRef<HTMLDivElement>;

  // ── State ──────────────────────────────────
  step: LoginStep = 'credentials';
  loading         = false;
  showPassword    = false;
  errorMessage    = '';
  loginWithOtp    = false;

  otpEmail       = '';
  resendCooldown = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;

  // Internal OTP values — simple array
  private vals = ['', '', '', '', '', ''];

  // ── Form ───────────────────────────────────
  credForm: FormGroup = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  ngAfterViewInit() {}

  // ── Pure DOM helpers (same as working test) ─
  private getInputs(): HTMLInputElement[] {
    if (!this.otpContainer) return [];
    return Array.from(
      this.otpContainer.nativeElement
        .querySelectorAll<HTMLInputElement>('.otp-box')
    );
  }

  private focusBox(i: number) {
    const inputs = this.getInputs();
    if (inputs[i]) { inputs[i].focus(); inputs[i].select(); }
  }

  private setBox(i: number, val: string) {
    this.vals[i] = val;
    const inputs = this.getInputs();
    if (inputs[i]) {
      inputs[i].value = val;
      inputs[i].classList.toggle('filled', val !== '');
    }
  }

  private clearBox(i: number) { this.setBox(i, ''); }

  private clearAllBoxes() {
    for (let i = 0; i < 6; i++) this.clearBox(i);
  }

  get otpFilled() { return this.vals.every(v => v !== ''); }
  get otpString() { return this.vals.join(''); }

  // ── Init OTP boxes after DOM renders ───────
  initOtpBoxes() {
    // Reset vals
    this.vals = ['', '', '', '', '', ''];

    // Wait for *ngIf to render the container
    setTimeout(() => {
      const inputs = this.getInputs();
      if (!inputs.length) return;

      inputs.forEach((inp, i) => {
        // Clean any old listeners by cloning
        const fresh = inp.cloneNode(true) as HTMLInputElement;
        inp.parentNode!.replaceChild(fresh, inp);
      });

      // Now attach listeners to fresh inputs
      const freshInputs = this.getInputs();

      freshInputs.forEach((inp, i) => {

        inp.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Backspace') {
            e.preventDefault();
            if (this.vals[i] !== '') {
              this.clearBox(i);
            } else if (i > 0) {
              this.clearBox(i - 1);
              this.focusBox(i - 1);
            }
            return;
          }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); this.focusBox(i - 1); return; }
          if (e.key === 'ArrowRight') { e.preventDefault(); this.focusBox(i + 1); return; }
          if (e.key === 'Tab') return;
          if (!/^\d$/.test(e.key)) e.preventDefault();
        });

        inp.addEventListener('input', () => {
          const digit = inp.value.replace(/\D/g, '').slice(-1);
          this.setBox(i, digit);
          if (digit && i < 5) this.focusBox(i + 1);
          if (this.otpFilled) setTimeout(() => this.verifyOtp(), 100);
        });
      });

      // Paste on container
      const container = this.otpContainer.nativeElement;
      container.addEventListener('paste', (e: ClipboardEvent) => {
        e.preventDefault();
        const text = (e.clipboardData?.getData('text') ?? '')
            .replace(/\D/g, '').slice(0, 6);
        for (let i = 0; i < 6; i++) this.setBox(i, text[i] ?? '');
        this.focusBox(Math.min(text.length, 5));
        if (text.length === 6) setTimeout(() => this.verifyOtp(), 200);
      }, { once: false });

      // Focus first box
      this.focusBox(0);
    }, 100);
  }

  // ── Toggle OTP checkbox ────────────────────
  toggleOtpMode(event: Event) {
    this.loginWithOtp = (event.target as HTMLInputElement).checked;
    this.errorMessage = '';
    if (this.loginWithOtp) {
      this.credForm.get('password')?.clearValidators();
    } else {
      this.credForm.get('password')?.setValidators(Validators.required);
    }
    this.credForm.get('password')?.updateValueAndValidity();
    this.cdr.detectChanges();
  }

  // ── Submit ─────────────────────────────────
  onSubmit() {
    this.credForm.get('email')?.markAsTouched();
    if (this.credForm.get('email')?.invalid) return;

    if (this.loginWithOtp) {
      this.sendOtpOnly();
    } else {
      if (this.credForm.invalid) {
        this.credForm.markAllAsTouched();
        return;
      }
      this.passwordLogin();
    }
  }

  private passwordLogin() {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    // loginWithOtp: false — backend seedha JWT dega
    const payload = { ...this.credForm.value, loginWithOtp: false };

    this.authService.login(payload).subscribe({
      next: (res: any) => {
        this.loading = false;
        // Seedha save karo aur redirect — OTP screen nahi
        this.authService.saveUserData(res);
        this.cdr.detectChanges();
        this.redirectUser(res);
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMessage =
          err.status === 401
            ? (err.error?.message || 'Invalid email or password')
            : err.status === 403
              ? 'Account is locked. Contact admin.'
              : err.error?.message || 'Login failed.';
        this.cdr.detectChanges();
      }
    });
  }

  private sendOtpOnly() {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService
      .resendOtp({ email: this.credForm.value.email })
      .subscribe({
        next: () => {
          this.loading  = false;
          this.otpEmail = this.credForm.value.email;
          this.goToOtpStep();
        },
        error: (err: any) => {
          this.loading = false;
          this.errorMessage =
            err.error?.message || 'Failed to send OTP.';
          this.cdr.detectChanges();
        }
      });
  }

  private goToOtpStep() {
    this.step = 'otp';
    this.startCooldown();
    this.cdr.detectChanges();
    // Init OTP boxes after *ngIf renders
    this.initOtpBoxes();
  }

  // ── Verify ─────────────────────────────────
  verifyOtp() {
    if (!this.otpFilled) {
      this.errorMessage = 'Please enter all 6 digits';
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.authService
      .verifyOtp({ email: this.otpEmail, otp: this.otpString })
      .subscribe({
        next: (res: any) => {
          this.authService.saveUserData(res);
          this.loading = false;
          this.step    = 'success';
          this.cdr.detectChanges();
          setTimeout(() => this.redirectUser(res), 1200);
        },
        error: (err: any) => {
          this.loading = false;
          this.errorMessage =
            err.error?.message || 'Invalid or expired OTP.';
          this.cdr.detectChanges();
          setTimeout(() => {
            this.clearAllBoxes();
            this.focusBox(0);
          }, 50);
        }
      });
  }

  // ── Resend ─────────────────────────────────
  resendOtp() {
    if (this.resendCooldown > 0 || this.loading) return;
    this.loading = true;
    this.cdr.detectChanges();

    this.authService.resendOtp({ email: this.otpEmail }).subscribe({
      next: () => {
        this.loading = false;
        this.clearAllBoxes();
        this.startCooldown();
        this.toastr.success('New OTP sent!');
        this.cdr.detectChanges();
        setTimeout(() => this.focusBox(0), 50);
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to resend OTP.');
        this.cdr.detectChanges();
      }
    });
  }

  private startCooldown() {
    this.resendCooldown = 30;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      this.resendCooldown--;
      this.cdr.detectChanges();
      if (this.resendCooldown <= 0) {
        clearInterval(this._timer!);
        this._timer = null;
      }
    }, 1000);
  }

  backToLogin() {
    this.step = 'credentials';
    this.errorMessage = '';
    this.vals = ['', '', '', '', '', ''];
    if (this._timer) clearInterval(this._timer);
    this.resendCooldown = 0;
    this.cdr.detectChanges();
  }

  private redirectUser(res: any) {
    const role = res.user?.role;
    if (res.isFirstLogin && role === 'CompanyAdmin')
      this.router.navigate(['/onboarding']);
    else if (role === 'SuperAdmin')
      this.router.navigate(['/admin']);
    else if (role === 'Customer')
      this.router.navigate(['/customer']);
    else
      this.router.navigate(['/dashboard']);
  }

  ngOnDestroy() {
    if (this._timer) clearInterval(this._timer);
  }
}