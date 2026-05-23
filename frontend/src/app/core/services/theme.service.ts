import { Injectable, signal } from '@angular/core';

type ThemeId =
  | 'theme-blue'
  | 'theme-dark'
  | 'theme-green'
  | 'theme-purple'
  | 'theme-orange'
  | 'theme-navy'
  | 'theme-rose'
  | 'theme-teal'
  | 'theme-amber'
  | 'theme-slate';

interface ThemeOption {
  id: ThemeId;
  name: string;
  color: string;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'im3_theme';
  private readonly fallbackTheme: ThemeId = 'theme-blue';
  private readonly themeState = signal<ThemeId>(this.fallbackTheme);

  readonly themes: ThemeOption[] = [
    { id: 'theme-blue', name: 'Ocean Blue', color: '#2563eb' },
    { id: 'theme-dark', name: 'Dark Mode', color: '#1a1a2e' },
    { id: 'theme-green', name: 'Forest Green', color: '#2e7d32' },
    { id: 'theme-purple', name: 'Royal Purple', color: '#6a1b9a' },
    { id: 'theme-orange', name: 'Cosmic Orange', color: '#e85d04' },
    { id: 'theme-navy', name: 'Midnight Navy', color: '#1e3a8a' },
    { id: 'theme-rose', name: 'Rose Pink', color: '#e11d48' },
    { id: 'theme-teal', name: 'Arctic Teal', color: '#0d9488' },
    { id: 'theme-amber', name: 'Golden Amber', color: '#b45309' },
    { id: 'theme-slate', name: 'Carbon Slate', color: '#334155' },
  ];

  currentTheme(): ThemeId {
    return this.themeState();
  }

  initTheme(): ThemeId {
    const savedTheme = localStorage.getItem(this.storageKey);
    return this.applyTheme(savedTheme);
  }

  applyTheme(themeId: string | null | undefined): ThemeId {
    const nextTheme = this.resolveTheme(themeId);
    const allThemeIds = this.themes.map((t) => t.id);

    document.body.classList.remove(...allThemeIds);
    document.body.classList.add(nextTheme);

    localStorage.setItem(this.storageKey, nextTheme);
    this.themeState.set(nextTheme);
    return nextTheme;
  }

  private resolveTheme(themeId: string | null | undefined): ThemeId {
    if (!themeId) return this.fallbackTheme;
    const match = this.themes.find((t) => t.id === themeId);
    return match?.id ?? this.fallbackTheme;
  }
}
