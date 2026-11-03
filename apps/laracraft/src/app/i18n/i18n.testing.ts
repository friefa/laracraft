import { EnvironmentProviders, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';
import { provideI18n } from './i18n.providers';

export const TEST_TRANSLATIONS: Record<string, Translation> = { de, en };

/** Serves the real translation files synchronously, without HTTP. For unit tests only. */
@Injectable({ providedIn: 'root' })
export class InlineTranslationLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of(TEST_TRANSLATIONS[lang] ?? {});
  }
}

export function provideI18nTesting(): EnvironmentProviders {
  return provideI18n(InlineTranslationLoader);
}
