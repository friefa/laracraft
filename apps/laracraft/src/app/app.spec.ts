import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { LANG_STORAGE_KEY } from './i18n/lang';
import { LanguageService } from './i18n/language.service';
import { provideI18nTesting } from './i18n/i18n.testing';

const DISCLAIMER = {
  de: 'Nicht offiziell. Nicht mit Mojang oder Microsoft verbunden.',
  en: 'Not official. Not associated with Mojang or Microsoft.',
};

async function render() {
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideI18nTesting()],
    });
  });

  it('renders landmarks, the app name and a labelled language switch', async () => {
    const { el } = await render();
    expect(el.querySelector('header .brand')?.textContent).toContain('laracraft');
    expect(el.querySelector('main')).not.toBeNull();
    expect(el.querySelector('footer nav a[href="/credits"]')).not.toBeNull();
    const select = el.querySelector<HTMLSelectElement>('header select');
    expect(select?.id).toBe('lang-select');
    expect(el.querySelector('label[for="lang-select"]')?.textContent?.trim()).toBeTruthy();
  });

  it('shows the English disclaimer by default for non-German devices', async () => {
    const { el } = await render();
    expect(el.querySelector('footer .disclaimer')?.textContent?.trim()).toBe(DISCLAIMER.en);
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows the German disclaimer when German is stored', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'de');
    const { el } = await render();
    expect(el.querySelector('footer .disclaimer')?.textContent?.trim()).toBe(DISCLAIMER.de);
    expect(el.querySelector('label[for="lang-select"]')?.textContent?.trim()).toBe('Sprache');
    expect(document.documentElement.lang).toBe('de');
  });

  it('switches language at runtime via the select and persists it', async () => {
    const { fixture, el } = await render();
    const select = el.querySelector<HTMLSelectElement>('#lang-select');
    if (!select) throw new Error('language select missing');

    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(el.querySelector('footer .disclaimer')?.textContent?.trim()).toBe(DISCLAIMER.de);
    expect(el.querySelector('footer nav')?.getAttribute('aria-label')).toBe('Rechtliches');
    expect(document.documentElement.lang).toBe('de');
    expect(TestBed.inject(LanguageService).lang()).toBe('de');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('de');

    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('footer .disclaimer')?.textContent?.trim()).toBe(DISCLAIMER.en);
    expect(document.documentElement.lang).toBe('en');
  });
});
