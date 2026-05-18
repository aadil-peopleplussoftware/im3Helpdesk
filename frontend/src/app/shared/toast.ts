import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({ providedIn: 'root' })
export class AppToastService {
  constructor(private toastr: ToastrService) {}

  success(msg = 'Saved successfully!') {
    Promise.resolve().then(() =>
      this.toastr.success(msg, '✓ Success', {
        timeOut: 2500,
        positionClass: 'toast-top-right',
        progressBar: true,
        closeButton: true
      })
    );
  }

  error(msg = 'Something went wrong!') {
    Promise.resolve().then(() =>
      this.toastr.error(msg, '✗ Error', {
        timeOut: 4000,
        positionClass: 'toast-top-right',
        progressBar: true,
        closeButton: true
      })
    );
  }

  info(msg: string) {
    Promise.resolve().then(() =>
      this.toastr.info(msg, '', {
        timeOut: 2000,
        positionClass: 'toast-top-right'
      })
    );
  }

  warning(msg: string) {
    Promise.resolve().then(() =>
      this.toastr.warning(msg, '⚠ Warning', {
        timeOut: 3000,
        positionClass: 'toast-top-right'
      })
    );
  }
}