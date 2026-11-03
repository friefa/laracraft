import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CREDITS_URL, THIRD_PARTY_LICENSES_URL, parseCredits } from './credits.model';

@Component({
  selector: 'lc-credits',
  imports: [TranslocoPipe],
  templateUrl: './credits.html',
  styleUrl: './credits.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsPage {
  protected readonly credits = httpResource(() => CREDITS_URL, { parse: parseCredits });

  /**
   * The license file only exists in production builds that copied it next to the app. A SPA
   * fallback answers unknown paths with index.html, so require a plain-text response. GET rather
   * than HEAD: Capacitor's local asset servers are only guaranteed to answer GET.
   */
  private readonly licensesProbe = httpResource.text(() => THIRD_PARTY_LICENSES_URL);
  protected readonly thirdPartyLicensesUrl = THIRD_PARTY_LICENSES_URL;
  protected readonly hasThirdPartyLicenses = computed(
    () =>
      this.licensesProbe.hasValue() &&
      (this.licensesProbe.headers()?.get('content-type') ?? '').startsWith('text/plain'),
  );

  protected isUnmodified(modifications: string): boolean {
    return modifications.trim().toLowerCase() === 'none';
  }
}
