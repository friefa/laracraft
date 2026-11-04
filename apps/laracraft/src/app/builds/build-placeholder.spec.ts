import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuildDocument, type BlockStateString } from '@laracraft/core-model';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { BuildStore } from '../storage/build-store';
import { BuildStoreError } from '../storage/build-store.types';
import { BuildPlaceholderPage } from './build-placeholder';

describe('BuildPlaceholderPage', () => {
  async function render(load: () => Promise<BuildDocument>) {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [BuildPlaceholderPage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: BuildStore, useValue: { load: vi.fn(load) } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(BuildPlaceholderPage);
    fixture.componentRef.setInput('id', 'b1');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the name and block count', async () => {
    const doc = new BuildDocument({
      name: 'Castle',
      edition: 'java',
      dataVersion: 4189,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    doc.setBlock({ x: 0, y: 0, z: 0 }, 'minecraft:stone' as BlockStateString);
    const el = await render(() => Promise.resolve(doc));
    expect(el.querySelector('h1')?.textContent).toContain('Castle');
    expect(el.textContent).toContain('Blocks: 1');
    expect(el.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('reports a missing build', async () => {
    const el = await render(() => Promise.reject(new BuildStoreError('not-found', 'x')));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'This build no longer exists.',
    );
  });
});
