import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { CreditsPage } from './credits';
import { CREDITS_URL, Credits, THIRD_PARTY_LICENSES_URL } from './credits.model';

const CREDITS: Credits = {
  version: 1,
  shareAlike: true,
  groups: [
    {
      pack: 'placeholder',
      title: 'laracraft placeholder textures',
      kind: 'own',
      authors: ['laracraft contributors'],
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      modifications: 'none',
      shareAlike: false,
      attribution: '…',
      textures: ['missing', 'stone'],
    },
    {
      pack: 'example',
      title: 'Example Pack',
      kind: 'third-party',
      authors: ['Alice', 'Bob'],
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      sourceUrl: 'https://example.org/pack',
      version: '1.2',
      modifications: 'Cropped to 16x16.',
      shareAlike: true,
      attribution: '…',
      textures: ['dirt'],
    },
  ],
};

describe('CreditsPage', () => {
  let fixture: ComponentFixture<CreditsPage>;
  let el: HTMLElement;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CreditsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideI18nTesting()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CreditsPage);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function flushLicenses(contentType: string | null) {
    const req = http.expectOne(THIRD_PARTY_LICENSES_URL);
    expect(req.request.method).toBe('GET');
    if (contentType) req.flush('', { headers: { 'content-type': contentType } });
    else req.flush('', { status: 404, statusText: 'Not Found' });
  }

  it('shows a loading state, then one entry per credit group', async () => {
    expect(el.textContent).toContain('Loading credits');
    http.expectOne(CREDITS_URL).flush(CREDITS);
    flushLicenses('text/plain; charset=utf-8');
    await fixture.whenStable();

    const groups = el.querySelectorAll('article.group');
    expect(groups).toHaveLength(2);
    const [own, third] = [...groups] as [HTMLElement, HTMLElement];

    expect(own.querySelector('h3')?.textContent).toContain('laracraft placeholder textures');
    expect(own.textContent).toContain('Own work');
    expect(own.querySelector('.share-alike')).toBeNull();

    expect(third.querySelector('h3')?.textContent).toContain('Example Pack');
    expect(third.textContent).toContain('1.2');
    expect(third.textContent).toContain('Alice, Bob');
    expect(third.textContent).toContain('Cropped to 16x16.');
    expect(third.textContent).toContain('Textures: 1');
    const license = third.querySelector<HTMLAnchorElement>(
      `a[href="${CREDITS.groups[1]?.licenseUrl}"]`,
    );
    expect(license?.textContent?.trim()).toBe('CC-BY-SA-4.0');
    expect(third.querySelector('a[href="https://example.org/pack"]')).not.toBeNull();
    expect(third.querySelector('.share-alike')?.textContent).toContain('ShareAlike');

    expect(el.querySelector('.disclaimer')?.textContent).toContain('Not associated with Mojang');
    expect(el.querySelector('a.oss-link')?.getAttribute('href')).toBe(THIRD_PARTY_LICENSES_URL);
  });

  it('shows an error state with retry when loading fails', async () => {
    http.expectOne(CREDITS_URL).flush('nope', { status: 404, statusText: 'Not Found' });
    flushLicenses(null);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'The credits could not be loaded.',
    );
    expect(el.querySelector('article.group')).toBeNull();
    expect(el.querySelector('a.oss-link')).toBeNull();

    el.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    fixture.detectChanges();
    http.expectOne(CREDITS_URL).flush(CREDITS);
    await fixture.whenStable();
    expect(el.querySelectorAll('article.group')).toHaveLength(2);
  });

  it('treats an unexpected file format as an error', async () => {
    http.expectOne(CREDITS_URL).flush({ version: 2 });
    flushLicenses('text/html');
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('a.oss-link')).toBeNull();
  });
});
