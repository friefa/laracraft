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
import { FALLBACK_LANG, SUPPORTED_LANGS } from './lang';
import { LanguageService } from './language.service';

/** Loads `public/i18n/<lang>.json` relative to `<base href>` (works in Capacitor too). */
@Injectable({ providedIn: 'root' })
export class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`i18n/${lang}.json`);
  }
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
