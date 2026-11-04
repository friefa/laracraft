import { TestBed } from '@angular/core/testing';
import type { BuildOrderRequest, BuildOrderResponse } from '@laracraft/build-order';
import { serializeBuild } from '@laracraft/core-model';
import { FIXTURE_PLAN, fixtureDocument } from './fixture-plan.testing';
import { PLANNER_UNAVAILABLE, handlePlanRequest, type PlannerModule } from './plan-host';
import { PLANNER_LOADER, PLAN_WORKER_FACTORY, PlanError, PlanService } from './plan.service';

/** Minimal stand-in for a `Worker`: records requests, lets the test reply. */
class MockWorker {
  readonly posted: BuildOrderRequest[] = [];
  onmessage: ((e: MessageEvent<BuildOrderResponse>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  terminate = vi.fn();
  postMessage(request: BuildOrderRequest): void {
    this.posted.push(request);
  }
  reply(response: BuildOrderResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<BuildOrderResponse>);
  }
  get lastId(): number {
    return this.posted.at(-1)?.id ?? -1;
  }
}

describe('PlanService', () => {
  let worker: MockWorker | undefined;
  let loader: ReturnType<typeof vi.fn<() => Promise<PlannerModule>>>;

  function setup(withWorker = true) {
    worker = withWorker ? new MockWorker() : undefined;
    loader = vi.fn(() => Promise.resolve<PlannerModule>({ planBuild: () => FIXTURE_PLAN }));
    TestBed.configureTestingModule({
      providers: [
        { provide: PLAN_WORKER_FACTORY, useValue: () => worker as unknown as Worker },
        { provide: PLANNER_LOADER, useValue: loader },
      ],
    });
    return TestBed.inject(PlanService);
  }

  it('sends the serialized build and reports progress, then the result', async () => {
    const service = setup();
    const progress = vi.fn();
    const promise = service.plan('b1', fixtureDocument(), progress);
    const request = worker?.posted[0];
    expect(request?.type).toBe('plan');
    expect(request?.file.format).toBe('laracraft-build');
    expect(request?.file.metadata.name).toBe('Fixture');

    worker?.reply({ type: 'progress', id: worker.lastId, done: 3, total: 10 });
    worker?.reply({ type: 'progress', id: 999, done: 1, total: 1 }); // other request: ignored
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith({ done: 3, total: 10 });

    worker?.reply({ type: 'result', id: worker.lastId, plan: FIXTURE_PLAN });
    await expect(promise).resolves.toBe(FIXTURE_PLAN);
  });

  it('rejects with a PlanError on an error response and does not cache it', async () => {
    const service = setup();
    const first = service.plan('b1', fixtureDocument());
    worker?.reply({ type: 'error', id: worker.lastId, message: 'boom' });
    await expect(first).rejects.toMatchObject({ name: 'PlanError', code: 'failed' });

    const second = service.plan('b1', fixtureDocument());
    expect(worker?.posted).toHaveLength(2);
    worker?.reply({ type: 'error', id: worker.lastId, message: PLANNER_UNAVAILABLE });
    const err = await second.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect((err as PlanError).code).toBe('planner-unavailable');
  });

  it('caches the plan per build until updatedAt changes', async () => {
    const service = setup();
    const a = service.plan('b1', fixtureDocument('2026-01-01T00:00:00Z'));
    worker?.reply({ type: 'result', id: worker.lastId, plan: FIXTURE_PLAN });
    await a;
    const b = service.plan('b1', fixtureDocument('2026-01-01T00:00:00Z'));
    expect(b).toBe(a);
    expect(worker?.posted).toHaveLength(1);

    void service.plan('b1', fixtureDocument('2026-02-01T00:00:00Z'));
    void service.plan('b2', fixtureDocument('2026-01-01T00:00:00Z'));
    expect(worker?.posted).toHaveLength(3);
  });

  it('falls back to the main thread when the worker fails to load', async () => {
    const service = setup();
    const promise = service.plan('b1', fixtureDocument());
    const w = worker as MockWorker;
    w.onerror?.(new Event('error'));
    await expect(promise).resolves.toBe(FIXTURE_PLAN);
    expect(w.terminate).toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('plans on the main thread when workers are unavailable', async () => {
    const service = setup(false);
    const progress = vi.fn();
    await expect(service.plan('b1', fixtureDocument(), progress)).resolves.toBe(FIXTURE_PLAN);
    expect(progress).toHaveBeenCalledWith({ done: 0, total: 1 });
  });
});

describe('handlePlanRequest', () => {
  it('prefers planBuildWithProgress and forwards its progress', async () => {
    const posted: BuildOrderResponse[] = [];
    const planBuildWithProgress = vi.fn(
      (_d, _r, _o, onProgress: (d: number, t: number) => void) => {
        onProgress(1, 2);
        return FIXTURE_PLAN;
      },
    );
    await handlePlanRequest(
      { type: 'plan', id: 7, file: serializeBuild(fixtureDocument()) },
      (r) => posted.push(r),
      () => Promise.resolve({ planBuildWithProgress } as PlannerModule),
    );
    expect(posted.map((r) => r.type)).toEqual(['progress', 'progress', 'result']);
    expect(posted[1]).toEqual({ type: 'progress', id: 7, done: 1, total: 2 });
    expect(planBuildWithProgress.mock.calls[0]?.[0].volume.blockCount).toBe(6);
  });

  it('reports a missing planner and invalid files as errors', async () => {
    const posted: BuildOrderResponse[] = [];
    await handlePlanRequest(
      { type: 'plan', id: 1, file: serializeBuild(fixtureDocument()) },
      (r) => posted.push(r),
      () => Promise.resolve({}),
    );
    expect(posted).toEqual([{ type: 'error', id: 1, message: PLANNER_UNAVAILABLE }]);

    posted.length = 0;
    await handlePlanRequest(
      { type: 'plan', id: 2, file: {} as BuildOrderRequest['file'] },
      (r) => posted.push(r),
      () => Promise.resolve({ planBuild: () => FIXTURE_PLAN }),
    );
    expect(posted[0]?.type).toBe('error');
  });
});
