import { Injectable, signal } from '@angular/core';
import { TRANSLATIONS } from '../shared/translations';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private langSignal = signal(
    localStorage.getItem('im3_lang') || 'en'
  );

  setLanguage(lang: string) {
    this.langSignal.set(lang);
    localStorage.setItem('im3_lang', lang);
    window.location.reload();
  }

  t(key: string): string {
    const lang = this.langSignal();
    return TRANSLATIONS[lang]?.[key]
      || TRANSLATIONS['en']?.[key]
      || key;
  }

  getCurrentLang(): string {
    return this.langSignal();
  }
  
}
