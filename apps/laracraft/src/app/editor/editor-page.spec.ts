import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type BlockStateString, BuildDocument } from '@laracraft/core-model';
import { LANG_STORAGE_KEY } from '../i18n/lang';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { BuildStore } from '../storage/build-store';
import { BuildStoreError, type BuildSummary } from '../storage/build-store.types';
import { EDITOR_AUTOSAVE_DELAY, EditorPage } from './editor-page';
import { ATLAS_LOADER } from './palette/block-icon';
import { FAVORITES_KEY } from './palette/palette-model';
import { RENDERER_FACTORY, RendererLoadError } from './renderer-loader';
import { FIRST_RUN_HINT_KEY, chromeInsets } from './editor-chrome';
import { FakeRenderer } from './testing/fake-renderer';

const STONE = 'minecraft:stone' as BlockStateString;

function makeDoc(blocks: { x: number; y: number; z: number }[] = [{ x: 0, y: 0, z: 0 }]) {
  const doc = new BuildDocument({
    name: 'Castle',
    edition: 'java',
    dataVersion: 4189,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  for (const pos of blocks) doc.setBlock(pos, STONE);
  doc.volume.takeDirtyChunks();
  return doc;
}

const SUMMARY: BuildSummary = {
  id: 'b1',
  name: 'Castle',
  createdAt: '',
  updatedAt: '',
  blockCount: 1,
  size: [1, 1, 1],
};

interface SetupOptions {
  doc?: BuildDocument;
  load?: () => Promise<BuildDocument>;
  rendererError?: Error;
  lang?: 'de' | 'en';
}

async function setup(options: SetupOptions = {}) {
  localStorage.clear();
  if (options.lang) localStorage.setItem(LANG_STORAGE_KEY, options.lang);
  const doc = options.doc ?? makeDoc();
  const renderer = new FakeRenderer();
  const store = {
    load: vi.fn(options.load ?? (() => Promise.resolve(doc))),
    save: vi.fn(() => Promise.resolve(SUMMARY)),
    exportFile: vi.fn(() => Promise.resolve(new Blob(['{}']))),
  };
  const factory = vi.fn(() =>
    options.rendererError ? Promise.reject(options.rendererError) : Promise.resolve(renderer),
  );
  TestBed.configureTestingModule({
    imports: [EditorPage],
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      { provide: BuildStore, useValue: store },
      { provide: RENDERER_FACTORY, useValue: factory },
      { provide: ATLAS_LOADER, useValue: () => Promise.resolve(null) },
      { provide: EDITOR_AUTOSAVE_DELAY, useValue: 5 },
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const fixture = TestBed.createComponent(EditorPage);
  fixture.componentRef.setInput('id', 'b1');
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, doc, renderer, store, factory };
}

const q = <T extends Element = HTMLElement>(el: Element, selector: string) => {
  const found = el.querySelector<T>(selector);
  if (!found) throw new Error(`No element for ${selector}`);
  return found;
};

async function click(fixture: ComponentFixture<unknown>, target: HTMLElement) {
  target.click();
  await fixture.whenStable();
}

async function key(fixture: ComponentFixture<unknown>, init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  await fixture.whenStable();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('EditorPage', () => {
  it('loads the build into the renderer and shows the name', async () => {
    const { el, renderer, doc } = await setup();
    expect(q(el, 'h1').textContent).toContain('Castle');
    expect(renderer.doc).toBe(doc);
    expect(q(el, '.save').textContent).toContain('Saved');
  });

  it('switches tools from the toolbar', async () => {
    const { fixture, el } = await setup();
    const place = q(el, '[data-tool="place"]');
    const remove = q(el, '[data-tool="remove"]');
    expect(place.getAttribute('aria-pressed')).toBe('true');
    expect(remove.getAttribute('aria-label')).toBe('Remove');
    await click(fixture, remove);
    expect(remove.getAttribute('aria-pressed')).toBe('true');
    expect(place.getAttribute('aria-pressed')).toBe('false');
  });

  it('places a block on tap, syncs the renderer and autosaves', async () => {
    const { fixture, el, doc, renderer, store } = await setup();
    renderer.look = { facing: 'east', pitch: 'level', yawDegrees: 90, pitchDegrees: 0 };
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(doc.getBlock(0, 1, 0)).toBe(STONE);
    expect(renderer.lookQueries).toBe(1);
    expect(renderer.updates).toBe(1);
    expect(q(el, '.save').textContent).toContain('Unsaved changes');
    await delay(20);
    await fixture.whenStable();
    expect(store.save).toHaveBeenCalledWith('b1', doc);
    expect(q(el, '.save').textContent).toContain('Saved');
  });

  it('shows a hover preview of the block a click would place, and of what remove deletes', async () => {
    const { fixture, doc, renderer } = await setup();
    renderer.hover({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(renderer.ghosts).toEqual([{ pos: { x: 0, y: 1, z: 0 }, state: STONE }]);
    expect(renderer.highlights[0]?.positions).toEqual([{ x: 0, y: 1, z: 0 }]);
    expect(doc.getBlock(0, 1, 0)).not.toBe(STONE); // preview only
    renderer.hover(null);
    expect(renderer.ghosts).toEqual([]);
    expect(renderer.highlights).toEqual([]);
  });

  it('removes on right click and picks the block on middle click', async () => {
    const { fixture, el, doc, renderer } = await setup();
    doc.setBlock({ x: 1, y: 0, z: 0 }, 'minecraft:cobblestone' as BlockStateString);
    renderer.tap({ pos: { x: 1, y: 0, z: 0 }, face: 'up' }, { button: 1 });
    await fixture.whenStable();
    expect(q(el, '.block-name').textContent).toContain('Cobblestone');
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' }, { button: 2 });
    await fixture.whenStable();
    expect(doc.getBlock(0, 0, 0)).toBe('minecraft:air');
    // The active tool is unchanged.
    expect(q(el, '[data-tool="place"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('places the first block of an empty build at the origin', async () => {
    const { fixture, doc, renderer } = await setup({ doc: makeDoc([]) });
    renderer.tap(null);
    await fixture.whenStable();
    expect(doc.getBlock(0, 0, 0)).toBe(STONE);
  });

  it('enables undo and redo according to the history', async () => {
    const { fixture, el, doc, renderer } = await setup();
    const undo = q<HTMLButtonElement>(el, '[data-action="undo"]');
    const redo = q<HTMLButtonElement>(el, '[data-action="redo"]');
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(undo.disabled).toBe(false);
    await click(fixture, undo);
    expect(doc.getBlock(0, 1, 0)).toBe('minecraft:air');
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(false);
    await click(fixture, redo);
    expect(doc.getBlock(0, 1, 0)).toBe(STONE);
    expect(renderer.updates).toBe(3);
  });

  it('cuts the view at the layer slider value', async () => {
    const blocks = [0, 1, 2, 3].map((y) => ({ x: 0, y, z: 0 }));
    const { fixture, el, renderer } = await setup({ doc: makeDoc(blocks) });
    const slider = q<HTMLInputElement>(el, '[data-control="layer"]');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('3');
    slider.value = '1';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(renderer.layerLimit).toBe(1);
    expect(slider.getAttribute('aria-valuetext')).toBe('Up to layer Y 1');
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(renderer.layerLimit).toBeNull();
    expect(slider.getAttribute('aria-valuetext')).toBe('All layers');
  });

  it('shows selection actions and keeps the renderer selection in sync', async () => {
    const { fixture, el, doc, renderer } = await setup();
    expect(el.querySelector('[data-command="editor.selection.fill"]')).toBeNull();
    await click(fixture, q(el, '[data-tool="select"]'));
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    renderer.tap({ pos: { x: 1, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(renderer.selectionBox).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } });
    await click(fixture, q(el, '[data-command="editor.selection.fill"]'));
    expect(doc.getBlock(1, 0, 0)).toBe(STONE);
    // Copy enables paste; paste shows a ghost preview and a confirm button.
    await click(fixture, q(el, '[data-command="editor.selection.copy"]'));
    await click(fixture, q(el, '[data-command="editor.selection.paste"]'));
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(renderer.ghosts).toHaveLength(2);
    await click(fixture, q(el, '[data-command="confirm-paste"]'));
    expect(doc.getBlock(1, 1, 0)).toBe(STONE);
    expect(renderer.ghosts).toHaveLength(0);
  });

  it('runs keyboard shortcuts', async () => {
    const { fixture, el, doc, renderer } = await setup();
    await key(fixture, { key: '2' });
    expect(q(el, '[data-tool="remove"]').getAttribute('aria-pressed')).toBe('true');
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(doc.getBlock(0, 0, 0)).toBe('minecraft:air');
    await key(fixture, { key: 'z', ctrlKey: true });
    expect(doc.getBlock(0, 0, 0)).toBe(STONE);
    await key(fixture, { key: 'z', metaKey: true, shiftKey: true });
    expect(doc.getBlock(0, 0, 0)).toBe('minecraft:air');
    await key(fixture, { key: 'f' });
    expect(renderer.frames).toHaveLength(1);
    await key(fixture, { key: '4' });
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(renderer.selectionBox).not.toBeNull();
    await key(fixture, { key: 'Escape' });
    expect(renderer.selectionBox).toBeNull();
  });

  it('ignores shortcuts while typing in a text field', async () => {
    const { fixture, el } = await setup();
    const input = document.createElement('input');
    el.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    await fixture.whenStable();
    expect(q(el, '[data-tool="place"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('explains edits that are too large', async () => {
    const { fixture, el, renderer } = await setup();
    await key(fixture, { key: '4' });
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    renderer.tap({ pos: { x: 100, y: 100, z: 100 }, face: 'up' });
    await fixture.whenStable();
    await click(fixture, q(el, '[data-command="editor.selection.fill"]'));
    const alert = q(el, '[data-error="action"]');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('1030301 blocks (limit 262144)');
  });

  it('reports a build that cannot be loaded', async () => {
    const { el, factory } = await setup({
      load: () => Promise.reject(new BuildStoreError('not-found', 'x')),
    });
    expect(q(el, '[data-error="load"]').textContent).toContain('This build no longer exists.');
    expect(el.querySelector('[data-error="load"] a[href="/"]')).not.toBeNull();
    expect(el.querySelector('[data-tool]')).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('explains a missing WebGL in German', async () => {
    const { el } = await setup({ rendererError: new RendererLoadError('webgl'), lang: 'de' });
    expect(q(el, '[data-error="renderer"]').textContent).toContain('3D-Ansicht nicht verfügbar');
    expect(q(el, '[data-tool="place"]').getAttribute('aria-label')).toBe('Setzen');
  });

  it('chooses a block from the palette', async () => {
    const { fixture, el, doc, renderer } = await setup({ lang: 'de' });
    expect(q(el, '.block-name').textContent).toContain('Stein');
    await click(fixture, q(el, '[data-action="palette"]'));
    const search = q<HTMLInputElement>(el, 'lc-block-palette input[type="search"]');
    search.value = 'bruchstein';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await click(fixture, q(el, '[data-block="minecraft:cobblestone"]'));
    expect(q(el, '.block-name').textContent).toContain('Bruchstein');
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    await fixture.whenStable();
    expect(doc.getBlock(0, 1, 0)).toBe('minecraft:cobblestone');
  });

  it('exports the build from the more menu', async () => {
    const { fixture, el, store } = await setup();
    await click(fixture, q(el, '[data-action="more"]'));
    expect(q(el, '[data-action="guide"]').getAttribute('href')).toBe('/build/b1/guide');
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    // jsdom cannot navigate to the download link.
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await click(fixture, q(el, '[data-action="export"]'));
    await fixture.whenStable();
    anchorClick.mockRestore();
    expect(store.exportFile).toHaveBeenCalledWith('b1');
    expect(createObjectURL).toHaveBeenCalled();
    expect(el.querySelector('#editor-menu')).toBeNull();
    expect(el.textContent).toContain('“Castle” exported.');
  });

  it('disposes the renderer and flushes pending changes on destroy', async () => {
    const { fixture, renderer, store } = await setup();
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    fixture.destroy();
    await delay(0);
    expect(renderer.disposed).toBe(true);
    expect(store.save).toHaveBeenCalled();
  });

  it('keeps favourites across sessions', async () => {
    const { fixture, el } = await setup();
    await click(fixture, q(el, '[data-action="palette"]'));
    await click(fixture, q(el, '[data-fav="minecraft:oak_planks"]'));
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')).toEqual([
      'minecraft:oak_planks',
    ]);
  });

  it('shows a first-run hint until it is dismissed', async () => {
    const first = await setup();
    expect(first.el.querySelector('[data-hint="first-run"]')?.textContent).toContain(
      'a face to place a block',
    );
    await click(first.fixture, q(first.el, '[data-action="dismiss-first-run"]'));
    expect(first.el.querySelector('[data-hint="first-run"]')).toBeNull();
    expect(localStorage.getItem(FIRST_RUN_HINT_KEY)).toBe('1');
    first.fixture.destroy();
    TestBed.resetTestingModule();
    // setup() clears localStorage: dismiss again through the stored flag.
    localStorage.setItem(FIRST_RUN_HINT_KEY, '1');
    const clear = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => undefined);
    const second = await setup();
    clear.mockRestore();
    expect(second.el.querySelector('[data-hint="first-run"]')).toBeNull();
  });

  it('keeps working when localStorage throws', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { el, fixture } = await setup();
      await click(fixture, q(el, '[data-action="dismiss-first-run"]'));
      expect(el.querySelector('[data-hint="first-run"]')).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('opens the Lara chat (onboarding without a key) and closes it again', async () => {
    sessionStorage.clear();
    const { fixture, el } = await setup();
    const fab = q<HTMLButtonElement>(el, '[data-action="lara"]');
    expect(fab.getAttribute('aria-expanded')).toBe('false');
    await click(fixture, fab);
    await delay(10);
    await fixture.whenStable();
    expect(fab.getAttribute('aria-expanded')).toBe('true');
    expect(q(el, '#lara-chat [data-state="onboarding"]')).toBeTruthy();
    await click(fixture, q(el, '[data-action="chat-close"]'));
    expect(el.querySelector('#lara-chat')).toBeNull();
  });

  it('records a Lara turn as one undo step and blocks edits while Lara works', async () => {
    const { fixture, el, doc, renderer, store } = await setup();
    const page = fixture.componentInstance as unknown as {
      laraHost: () => import('../lara/lara-chat-host').LaraChatHost;
    };
    const host = page.laraHost();
    expect(host.buildId).toBe('b1');
    expect(host.canUndoTurn()).toBe(false);

    host.setBusy(true);
    await fixture.whenStable();
    expect(q<HTMLButtonElement>(el, '[data-action="undo"]').disabled).toBe(true);
    renderer.tap({ pos: { x: 0, y: 0, z: 0 }, face: 'up' });
    expect(doc.getBlock(0, 1, 0)).not.toBe(STONE);

    // Live preview: the agent applies operations directly to the document.
    const changes = [
      { pos: { x: 1, y: 0, z: 0 }, before: doc.getBlock(1, 0, 0), after: STONE },
      { pos: { x: 2, y: 0, z: 0 }, before: doc.getBlock(2, 0, 0), after: STONE },
    ];
    doc.apply({ changes: changes.slice(0, 1), origin: 'lara' });
    host.previewChanged();
    doc.apply({ changes: changes.slice(1), origin: 'lara' });
    host.previewChanged();
    expect(renderer.updates).toBe(2);

    host.recordTurn({ changes, origin: 'lara', label: 'Lara' });
    host.setBusy(false);
    await fixture.whenStable();
    expect(host.canUndoTurn()).toBe(true);
    expect(q<HTMLButtonElement>(el, '[data-action="undo"]').disabled).toBe(false);
    await delay(20);
    expect(store.save).toHaveBeenCalled();

    expect(host.undoTurn()).toBe(true);
    expect(doc.getBlock(1, 0, 0)).not.toBe(STONE);
    expect(doc.getBlock(2, 0, 0)).not.toBe(STONE);
    expect(host.canUndoTurn()).toBe(false);
    expect(host.undoTurn()).toBe(false);
  });

  it('tells the renderer which canvas edges the toolbars cover before framing', async () => {
    const { renderer } = await setup();
    expect(renderer.insets.length).toBeGreaterThan(0);
  });
});

describe('chromeInsets', () => {
  const rect = (top: number, right: number, bottom: number, left: number) => ({
    top,
    right,
    bottom,
    left,
  });
  it('measures the bars and the layer slider against the canvas', () => {
    const canvas = rect(0, 390, 844, 0);
    expect(
      chromeInsets(canvas, {
        top: rect(0, 390, 53, 0),
        bottom: rect(790, 390, 844, 0),
        right: rect(260, 386, 584, 334),
      }),
    ).toEqual({ top: 53, right: 56, bottom: 54, left: 0 });
    expect(chromeInsets(canvas, {})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
