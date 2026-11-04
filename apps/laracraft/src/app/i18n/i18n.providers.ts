import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  Injectable,
  Type,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { catchError, forkJoin, map, of } from 'rxjs';
import { FALLBACK_LANG, SUPPORTED_LANGS } from './lang';
import { LanguageService } from './language.service';

/**
 * Loads `public/i18n/<lang>.json` plus the generated block names
 * `public/i18n/blocks/<lang>.json` (keys `block.*`, see
 * `scripts/generate-block-names.ts`) relative to `<base href>` (works in Capacitor too).
 * Missing block names fall back to the fallback language instead of failing the UI.
 */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return forkJoin([
      this.http.get<Translation>(`i18n/${lang}.json`),
      this.http
        .get<Translation>(`i18n/blocks/${lang}.json`)
        .pipe(catchError(() => of<Translation>({}))),
    ]).pipe(map(([ui, blocks]) => mergeTranslations(ui, blocks)));
  }
}

/** Shallow merge of translation files with disjoint top-level keys. */
export function mergeTranslations(...parts: Translation[]): Translation {
  return Object.assign({}, ...parts) as Translation;
}

/** Runtime i18n (Transloco) plus an initializer that loads the initial language. */
export function provideI18n(
  loader: Type<TranslocoLoader> = HttpTranslationLoader,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LANGS],
        defaultLang: FALLBACK_LANG,
        fallbackLang: FALLBACK_LANG,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true },
      },
      loader,
    }),
    provideAppInitializer(() => inject(LanguageService).init()),
  ]);
}
