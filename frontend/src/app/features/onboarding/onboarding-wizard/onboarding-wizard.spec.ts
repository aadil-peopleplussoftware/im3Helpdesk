import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';
import { vi } from 'vitest';

import { OnboardingWizardComponent } from './onboarding-wizard';
import { environment } from '../../../../environments/environment';

describe('OnboardingWizardComponent', () => {
  let component: OnboardingWizardComponent;
  let fixture: ComponentFixture<OnboardingWizardComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  function initComponentWithOrgResponse(body: any, status = 200, statusText = 'OK') {
    fixture.detectChanges();
    const request = httpMock.expectOne(`${environment.apiUrl}/Organizations/current`);
    request.flush(body, { status, statusText });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingWizardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimations(),
        provideToastr(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ step: 'mail' })
            }
          }
        }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingWizardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    initComponentWithOrgResponse({});
    expect(component).toBeTruthy();
  });

  it('starts on mailbox step when setup requests the mail step', () => {
    initComponentWithOrgResponse({ message: 'not found' }, 404, 'Not Found');

    expect(component.currentStep).toBe(2);
  });

  it('marks onboarding complete and routes to dashboard when mailbox setup is skipped', () => {
    vi.spyOn(router, 'navigate');
    localStorage.setItem('im3_isFirstLogin', 'true');

    initComponentWithOrgResponse({
      name: 'Apple X copy',
      supportEmail: 'mda.aadil8@gmail.com'
    });

    component.skipMailbox();

    const completeRequest = httpMock.expectOne(`${environment.apiUrl}/Organizations/current/complete-onboarding`);
    expect(completeRequest.request.method).toBe('POST');
    completeRequest.flush({ message: 'Onboarding completed' });

    expect(localStorage.getItem('im3_isFirstLogin')).toBe('false');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
