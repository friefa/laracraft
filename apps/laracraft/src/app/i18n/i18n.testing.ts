import { EnvironmentProviders, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import deBlocks from '../../../public/i18n/blocks/de.json';
import enBlocks from '../../../public/i18n/blocks/en.json';
import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';
import { mergeTranslations, provideI18n } from './i18n.providers';

export const TEST_TRANSLATIONS: Record<string, Translation> = {
  de: mergeTranslations(de, deBlocks),
  en: mergeTranslations(en, enBlocks),
};

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
