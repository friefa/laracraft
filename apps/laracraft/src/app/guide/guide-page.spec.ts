import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BuildPlan } from '@laracraft/build-order';
import type { BuildDocument } from '@laracraft/core-model';
import type { BuildRenderer, HighlightGroup } from '@laracraft/renderer';
import { provideI18nTesting } from '../i18n/i18n.testing';
import { LanguageService } from '../i18n/language.service';
import { BuildStore } from '../storage/build-store';
import { BuildStoreError } from '../storage/build-store.types';
import { checklistKey } from './checklist';
import { FIXTURE_PLAN, fixtureDocument } from './fixture-plan.testing';
import { GuidePage } from './guide-page';
import { RENDERER_FACTORY_LOADER } from './guide-viewport';
import type { PlannerModule } from './plan-host';
import { PLANNER_LOADER, PLAN_WORKER_FACTORY } from './plan.service';

function fakeRenderer() {
  return {
    setDocument: vi.fn<(doc: BuildDocument) => void>(),
    update: vi.fn(),
    setLayerLimit: vi.fn<(y: number | null) => void>(),
    setHighlights: vi.fn<(g: readonly HighlightGroup[]) => void>(),
    setGhosts: vi.fn(),
    setSelectionBox: vi.fn(),
    pick: vi.fn(() => null),
    onTap: vi.fn(() => () => undefined),
    frame: vi.fn(),
    stats: vi.fn(() => ({ fps: 0, drawCalls: 0, triangles: 0, chunks: 0 })),
    dispose: vi.fn(),
  } satisfies BuildRenderer;
}

describe('GuidePage', () => {
  let fixture: ComponentFixture<GuidePage>;
  let el: HTMLElement;
  let renderer: ReturnType<typeof fakeRenderer>;

  async function render(
    options: {
      load?: () => Promise<BuildDocument>;
      planner?: PlannerModule;
      withRenderer?: boolean;
    } = {},
  ) {
    renderer = fakeRenderer();
    const planner: PlannerModule = options.planner ?? { planBuild: () => FIXTURE_PLAN };
    TestBed.configureTestingModule({
      imports: [GuidePage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        {
          provide: BuildStore,
          useValue: { load: vi.fn(options.load ?? (() => Promise.resolve(fixtureDocument()))) },
        },
        { provide: PLAN_WORKER_FACTORY, useValue: () => undefined },
        { provide: PLANNER_LOADER, useValue: () => Promise.resolve(planner) },
        {
          provide: RENDERER_FACTORY_LOADER,
          useValue: () =>
            Promise.resolve(
              options.withRenderer === false ? undefined : () => Promise.resolve(renderer),
            ),
        },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    fixture = TestBed.createComponent(GuidePage);
    fixture.componentRef.setInput('id', 'b1');
    await settle();
    el = fixture.nativeElement as HTMLElement;
  }

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  const stepOf = () => el.querySelector('.step-of')?.textContent?.trim();
  const button = (label: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement;
  const lastHighlights = () => renderer.setHighlights.mock.calls.at(-1)?.[0] ?? [];

  beforeEach(() => localStorage.clear());

  it('shows the first step with phase badge, materials and back link', async () => {
    await render();
    expect(stepOf()).toBe('Step 1 of 3');
    expect(el.querySelector('.badge')?.textContent).toContain('Structure');
    expect(el.textContent).toContain('2× Stone');
    expect(el.querySelector('a[href="/build/b1"]')).not.toBeNull();
    expect(button('Previous step').disabled).toBe(true);
  });

  it('navigates with buttons, arrow keys and the slider and updates the 3D view', async () => {
    await render();
    expect(renderer.setDocument).toHaveBeenCalledTimes(1);
    const doc = renderer.setDocument.mock.calls[0]?.[0] as BuildDocument;
    expect(doc.volume.blockCount).toBe(3);

    button('Next step').click();
    await settle();
    expect(stepOf()).toBe('Step 2 of 3');
    expect(el.querySelector('.badge')?.textContent).toContain('Redstone');
    expect(doc.volume.blockCount).toBe(7);
    expect(renderer.update).toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await settle();
    expect(stepOf()).toBe('Step 3 of 3');
    expect(doc.volume.blockCount).toBe(6);
    expect(lastHighlights().find((h) => h.id === 'removal')?.positions).toEqual([
      { x: 2, y: 0, z: 0 },
    ]);
    expect(button('Next step').disabled).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await settle();
    expect(stepOf()).toBe('Step 2 of 3');
    expect(doc.getBlock(2, 0, 0)).toBe('minecraft:dirt');

    const slider = el.querySelector<HTMLInputElement>('input[type="range"]') as HTMLInputElement;
    slider.value = '1';
    slider.dispatchEvent(new Event('input'));
    await settle();
    expect(stepOf()).toBe('Step 1 of 3');
    expect(renderer.setDocument).toHaveBeenCalledTimes(1);
  });

  it('selects an action and shows where to stand, look and click', async () => {
    await render();
    button('Next step').click();
    await settle();
    button('Block 2 at 0 / 1 / 0').click();
    await settle();
    const detail = el.querySelector('.detail')?.textContent ?? '';
    expect(detail).toContain('Stand at 0 / 0 / 2 (feet)');
    expect(detail).toContain('Look north, straight ahead');
    expect(detail).toContain('Click the north side of');
    expect(detail).toContain('Aim at the lower half of that face');
    expect(lastHighlights().map((h) => h.id)).toEqual([
      'current',
      'current-outline',
      'selected',
      'stand',
      'click-target',
    ]);
    // The selection is reset when the step changes.
    button('Next step').click();
    await settle();
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('renders hints and the toggles for next-step ghosts and layer limit', async () => {
    await render();
    expect(el.textContent).toContain('Sand and gravel fall');
    const [showNext, layerOnly] = Array.from(
      el.querySelectorAll<HTMLInputElement>('.options input'),
    );
    showNext?.click();
    layerOnly?.click();
    await settle();
    expect(renderer.setGhosts.mock.calls.at(-1)?.[0]).toHaveLength(4);
    expect(renderer.setLayerLimit).toHaveBeenLastCalledWith(0);
  });

  it('persists the materials checklist of the overview tab per build', async () => {
    await render();
    (Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'))[1] as HTMLElement).click();
    await settle();
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const cells = rows.map((r) =>
      Array.from(r.querySelectorAll('td'))
        .map((td) => td.textContent?.trim())
        .join('|'),
    );
    expect(cells).toContain('|Stone|2×64 + 12');
    expect(el.textContent).toContain('No position found from which this block can be reached.');
    const stone = el.querySelector<HTMLInputElement>(
      'input[aria-label="Stone gathered"]',
    ) as HTMLInputElement;
    stone.click();
    await settle();
    expect(JSON.parse(localStorage.getItem(checklistKey('b1')) ?? '[]')).toEqual([
      'minecraft:stone',
    ]);
    expect(el.textContent).toContain('1 of 5 gathered');

    fixture.destroy();
    TestBed.resetTestingModule();
    await render();
    (Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'))[1] as HTMLElement).click();
    await settle();
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Stone gathered"]')?.checked).toBe(
      true,
    );
  });

  it('shows the plan progress text in German', async () => {
    let resolvePlan: (p: BuildPlan) => void = () => undefined;
    const pending = new Promise<BuildPlan>((r) => (resolvePlan = r));
    renderer = fakeRenderer();
    TestBed.configureTestingModule({
      imports: [GuidePage],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: BuildStore, useValue: { load: () => Promise.resolve(fixtureDocument()) } },
        { provide: PLAN_WORKER_FACTORY, useValue: () => undefined },
        {
          provide: PLANNER_LOADER,
          useValue: () => pending.then((plan) => ({ planBuild: () => plan })),
        },
        { provide: RENDERER_FACTORY_LOADER, useValue: () => Promise.resolve(undefined) },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    await TestBed.inject(LanguageService).use('de');
    fixture = TestBed.createComponent(GuidePage);
    fixture.componentRef.setInput('id', 'b1');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Baureihenfolge wird berechnet');
    resolvePlan(FIXTURE_PLAN);
    await settle();
    expect(stepOf()).toBe('Schritt 1 von 3');
    expect(el.textContent).toContain('Die 3D-Ansicht ist auf diesem Gerät nicht verfügbar.');
  });

  it('reports a missing planner and a missing build', async () => {
    await render({ planner: {} });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'The build order engine is not available',
    );
    fixture.destroy();
    TestBed.resetTestingModule();
    await render({ load: () => Promise.reject(new BuildStoreError('not-found', 'x')) });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'This build no longer exists.',
    );
  });

  it('cycles the phone bottom sheet through its snap points from the handle', async () => {
    await render();
    const layout = el.querySelector('.layout') as HTMLElement;
    const handle = el.querySelector('.handle') as HTMLButtonElement;
    expect(layout.dataset['snap']).toBe('half');
    expect(handle.getAttribute('aria-label')).toBe('Resize the guide panel: half open');
    handle.click();
    await settle();
    expect(layout.dataset['snap']).toBe('full');
    handle.click();
    await settle();
    expect(layout.dataset['snap']).toBe('peek');
    expect(handle.getAttribute('aria-label')).toContain('collapsed');
    // Step navigation stays in the sheet head, so it works in every snap point.
    button('Next step').click();
    await settle();
    expect(stepOf()).toBe('Step 2 of 3');
  });
});
