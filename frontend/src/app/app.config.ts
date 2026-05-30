import { ApplicationConfig } from '@angular/core';
import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { OrgContextService } from './core/services/org-context.service';

export const appConfig: ApplicationConfig = {
	providers: [
		provideRouter(routes),
		provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
		// Default timezone for the built-in `| date` pipe. We expose
		// `.timezone` via a getter so that every pipe transform reads the
		// CURRENT value from OrgContextService instead of a snapshot taken
		// at bootstrap. (Note: built-in DatePipe is pure, so views rendered
		// before a timezone change still need a refresh — the Settings page
		// does a one-time location.reload() after saving.)
		{
			provide: DATE_PIPE_DEFAULT_OPTIONS,
			useFactory: (org: OrgContextService) => ({
				get timezone() { return org.timezone(); }
			}),
			deps: [OrgContextService]
		},
		provideAnimations(),
		provideToastr({
			timeOut: 10000,
			extendedTimeOut: 1000,
			positionClass: 'toast-top-center',
			preventDuplicates: true,
			progressBar: true,
			closeButton: true,
			tapToDismiss: true,
			newestOnTop: true,
			maxOpened: 3
		})
	]
};