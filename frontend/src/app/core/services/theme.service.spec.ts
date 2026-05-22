import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  it('should default to theme-blue when storage is empty', () => {
    const theme = service.initTheme();

    expect(theme).toBe('theme-blue');
    expect(document.body.classList.contains('theme-blue')).toBe(true);
    expect(localStorage.getItem('im3_theme')).toBe('theme-blue');
  });

  it('should load a saved theme and apply it to body', () => {
    localStorage.setItem('im3_theme', 'theme-dark');

    const theme = service.initTheme();

    expect(theme).toBe('theme-dark');
    expect(document.body.classList.contains('theme-dark')).toBe(true);
    expect(service.currentTheme()).toBe('theme-dark');
  });

  it('should replace previous theme class when applying new one', () => {
    service.applyTheme('theme-blue');
    service.applyTheme('theme-rose');

    expect(document.body.classList.contains('theme-blue')).toBe(false);
    expect(document.body.classList.contains('theme-rose')).toBe(true);
    expect(localStorage.getItem('im3_theme')).toBe('theme-rose');
    expect(service.currentTheme()).toBe('theme-rose');
  });

  it('should fallback to default for unsupported theme ids', () => {
    service.applyTheme('unknown-theme');

    expect(document.body.classList.contains('theme-blue')).toBe(true);
    expect(localStorage.getItem('im3_theme')).toBe('theme-blue');
  });
});
