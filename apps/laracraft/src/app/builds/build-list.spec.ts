import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LANG_STORAGE_KEY } from '../i18n/lang';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { BuildStore } from '../storage/build-store';
import { BuildStoreError, type BuildSummary } from '../storage/build-store.types';
import { BuildListPage } from './build-list';

const CASTLE: BuildSummary = {
  id: 'b1',
  name: 'Castle',
  createdAt: '2026-01-01T10:00:00Z',
  updatedAt: '2026-03-05T14:30:00Z',
  blockCount: 1234,
  size: [10, 20, 30],
};
const HUT: BuildSummary = { ...CASTLE, id: 'b2', name: 'Hut', blockCount: 5, size: [2, 3, 4] };

function mockStore(builds: BuildSummary[] = [CASTLE, HUT]) {
  return {
    list: vi.fn(() => Promise.resolve(builds)),
    load: vi.fn(),
    save: vi.fn(),
    create: vi.fn(() => Promise.resolve('new-id')),
    rename: vi.fn((id: string, name: string) => Promise.resolve({ ...CASTLE, id, name })),
    duplicate: vi.fn(() => Promise.resolve('copy-id')),
    delete: vi.fn(() => Promise.resolve()),
    exportFile: vi.fn(() => Promise.resolve(new Blob(['{}'], { type: 'application/json' }))),
    importFile: vi.fn(() => Promise.resolve('b2')),
  } satisfies BuildStore;
}

describe('BuildListPage', () => {
  let store: ReturnType<typeof mockStore>;
  let fixture: ComponentFixture<BuildListPage>;
  let el: HTMLElement;

  async function render(builds?: BuildSummary[]) {
    store = mockStore(builds);
    TestBed.configureTestingModule({
      imports: [BuildListPage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: BuildStore, useValue: store },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    fixture = TestBed.createComponent(BuildListPage);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  const items = () => [...el.querySelectorAll<HTMLElement>('li.build')];
  const button = (root: ParentNode, action: string) => {
    const b = root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    if (!b) throw new Error(`button ${action} missing`);
    return b;
  };
  const dialog = () => el.querySelector('dialog') as HTMLDialogElement;

  async function click(b: HTMLButtonElement) {
    b.click();
    await fixture.whenStable();
  }

  async function typeName(value: string) {
    const input = dialog().querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('name input missing');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function confirm() {
    await click(button(dialog(), 'confirm'));
  }

  beforeEach(() => localStorage.clear());

  it('renders one item per build with name, link, counts and localized date', async () => {
    await render();
    expect(el.querySelector('h1')?.textContent).toContain('My builds');
    expect(items()).toHaveLength(2);
    const [castle] = items() as [HTMLElement];
    const link = castle.querySelector('a');
    expect(link?.textContent?.trim()).toBe('Castle');
    expect(link?.getAttribute('href')).toBe('/build/b1');
    expect(castle.textContent).toContain('Blocks: 1234');
    expect(castle.textContent).toContain('Size: 10 × 20 × 30');
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(CASTLE.updatedAt),
    );
    expect(castle.textContent).toContain(`Changed ${date}`);
    expect(button(castle, 'rename').getAttribute('aria-describedby')).toBe('build-name-b1');
  });

  it('formats dates in the active locale', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'de');
    await render();
    const date = new Intl.DateTimeFormat('de', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(CASTLE.updatedAt),
    );
    expect(el.querySelector('h1')?.textContent).toContain('Meine Bauten');
    expect(items()[0]?.textContent).toContain(`Geändert ${date}`);
  });

  it('shows a friendly empty state with a call to action', async () => {
    await render([]);
    expect(items()).toHaveLength(0);
    expect(el.querySelector('.empty h2')?.textContent).toContain('No builds yet');
    await click(button(el, 'empty-new'));
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('h2')?.textContent).toContain('New build');
  });

  it('shows an error with retry when the list cannot be loaded', async () => {
    await render();
    store.list.mockRejectedValueOnce(new BuildStoreError('unavailable', 'x'));
    // Trigger a reload through an action.
    await click(button(items()[0] as HTMLElement, 'duplicate'));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Your builds could not be loaded.',
    );
    await click(el.querySelector<HTMLButtonElement>('.state.error button') as HTMLButtonElement);
    expect(items()).toHaveLength(2);
  });

  it('creates a build via the name dialog and opens it', async () => {
    await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await click(button(el, 'new'));
    const input = dialog().querySelector<HTMLInputElement>('input');
    expect(input?.value).toBe('My build');
    expect(el.querySelector('label[for="build-name-input"]')).not.toBeNull();

    await typeName('   ');
    expect(button(dialog(), 'confirm').disabled).toBe(true);
    await typeName('Bridge');
    await confirm();

    expect(store.create).toHaveBeenCalledWith('Bridge');
    expect(navigate).toHaveBeenCalledWith(['/build', 'new-id']);
    expect(dialog().open).toBe(false);
  });

  it('renames a build', async () => {
    await render();
    await click(button(items()[0] as HTMLElement, 'rename'));
    expect(dialog().querySelector('input')?.value).toBe('Castle');
    await typeName('Fortress');
    await confirm();
    expect(store.rename).toHaveBeenCalledWith('b1', 'Fortress');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Renamed to “Fortress”.');
    expect(store.list).toHaveBeenCalledTimes(2);
  });

  it('duplicates a build with a localized copy name', async () => {
    await render();
    await click(button(items()[1] as HTMLElement, 'duplicate'));
    expect(store.duplicate).toHaveBeenCalledWith('b2', 'Hut (copy)');
  });

  it('deletes only after confirmation', async () => {
    await render();
    await click(button(items()[0] as HTMLElement, 'delete'));
    expect(dialog().textContent).toContain('“Castle” will be removed');

    const cancel = [...dialog().querySelectorAll('button')].find((b) => b.type === 'button');
    await click(cancel as HTMLButtonElement);
    expect(store.delete).not.toHaveBeenCalled();
    expect(dialog().open).toBe(false);

    await click(button(items()[0] as HTMLElement, 'delete'));
    await confirm();
    expect(store.delete).toHaveBeenCalledWith('b1');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('“Castle” deleted.');
  });

  it('exports a build as a .lcb.json download', async () => {
    await render();
    const createUrl = vi.fn(() => 'blob:test');
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clicked: HTMLAnchorElement[] = [];
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    try {
      await click(button(items()[0] as HTMLElement, 'export'));
      expect(store.exportFile).toHaveBeenCalledWith('b1');
      expect(clicked[0]?.download).toBe('Castle.lcb.json');
      expect(clicked[0]?.getAttribute('href')).toBe('blob:test');
      expect(el.querySelector('[role="status"]')?.textContent).toContain('“Castle” exported.');
    } finally {
      anchorClick.mockRestore();
    }
  });

  it('imports a chosen file and reports errors in a friendly way', async () => {
    await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('file input missing');
    expect(input.accept).toContain('.lcb.json');
    const file = new File(['{}'], 'hut.lcb.json');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(store.importFile).toHaveBeenCalledWith(file);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('“Hut” imported.');

    store.importFile.mockRejectedValueOnce(new BuildStoreError('invalid-file', 'bad'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('.banner[role="alert"]')?.textContent).toContain(
      'This file is not a valid laracraft build.',
    );

    store.importFile.mockRejectedValueOnce(new BuildStoreError('too-large', 'big'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('.banner[role="alert"]')?.textContent).toContain('maximum 20 MB');
  });

  it('shows quota errors from actions', async () => {
    await render();
    store.duplicate.mockRejectedValueOnce(new BuildStoreError('quota', 'full'));
    await click(button(items()[0] as HTMLElement, 'duplicate'));
    expect(el.querySelector('.banner[role="alert"]')?.textContent).toContain(
      'Not enough storage space.',
    );
  });
});
