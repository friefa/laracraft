import {
  BuildDocument,
  createJavaBlockRegistry,
  type BlockStateString,
  type BuildMetadata,
} from '@laracraft/core-model';
import type { ChunkMeshOutput, MesherRequest, MesherResponse } from '../mesh/types';
import { createMesherHandler } from '../mesh/worker-handler';
import {
  ChunkScheduler,
  createWorkerBackend,
  type ChunkSink,
  type MesherBackend,
  type WorkerLike,
} from './chunk-scheduler';

const META: BuildMetadata = {
  name: 'test',
  dataVersion: 1,
  edition: 'java',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const STONE = 'minecraft:stone' as BlockStateString;
const DIRT = 'minecraft:dirt' as BlockStateString;
const TORCH = 'minecraft:torch' as BlockStateString;
const AIR = 'minecraft:air' as BlockStateString;
const registry = createJavaBlockRegistry();
const textures = { missing: 0, stone: 1, dirt: 2, torch: 3 };

/** Records sink calls; keeps the last output per key. */
function stubSink() {
  const log: string[] = [];
  const shown = new Map<string, ChunkMeshOutput>();
  const sink: ChunkSink = {
    setChunk: (key, output) => {
      log.push(`set ${key}`);
      shown.set(key, output);
    },
    removeChunk: (key) => {
      log.push(`remove ${key}`);
      shown.delete(key);
    },
    clear: () => {
      log.push('clear');
      shown.clear();
    },
  };
  return { sink, log, shown };
}

/** Async backend: queues requests until `flush()` (like a worker). */
function queuedBackend() {
  const handle = createMesherHandler();
  const queue: MesherRequest[] = [];
  const posted: MesherRequest[] = [];
  let respond: (r: MesherResponse) => void = () => undefined;
  const factory = (cb: (r: MesherResponse) => void): MesherBackend => {
    respond = cb;
    return {
      post: (req) => {
        posted.push(req);
        queue.push(req);
      },
      dispose: () => undefined,
    };
  };
  const flush = () => {
    while (queue.length > 0) {
      const reply = handle(queue.shift() as MesherRequest);
      if (reply) respond(reply.response);
    }
  };
  return { factory, flush, posted };
}

const meshKeys = (posted: MesherRequest[]) =>
  posted.flatMap((r) =>
    r.type === 'mesh' ? [`${r.input.coord.x},${r.input.coord.y},${r.input.coord.z}`] : [],
  );

describe('ChunkScheduler', () => {
  it('meshes all chunks on setDocument and only dirty chunks on update', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 1, y: 1, z: 1 }, STONE);
    doc.setBlock({ x: 40, y: 1, z: 1 }, STONE);
    const { sink, log, shown } = stubSink();
    const s = new ChunkScheduler(registry, textures, sink);
    s.setDocument(doc);
    expect(s.update().sort()).toEqual(['0,0,0', '2,0,0']);
    expect(log).toEqual(['clear', 'set 0,0,0', 'set 2,0,0']);
    expect(s.chunkCount).toBe(2);
    expect(shown.get('0,0,0')?.opaque.indices.length).toBe(36);

    log.length = 0;
    expect(s.update()).toEqual([]);
    doc.setBlock({ x: 2, y: 1, z: 1 }, STONE);
    expect(s.update()).toEqual(['0,0,0']);
    expect(log).toEqual(['set 0,0,0']);
  });

  it('removes chunks that became empty and ignores dirty neighbours without blocks', () => {
    const doc = new BuildDocument(META);
    const { sink, log } = stubSink();
    const s = new ChunkScheduler(registry, textures, sink);
    s.setDocument(doc);
    doc.setBlock({ x: 0, y: 0, z: 0 }, STONE); // also dirties 3 neighbour keys (border)
    expect(s.update().length).toBe(4);
    expect(log).toEqual(['clear', 'set 0,0,0']);
    doc.setBlock({ x: 0, y: 0, z: 0 }, AIR);
    s.update();
    expect(log.slice(2)).toEqual(['remove 0,0,0']);
    expect(s.chunkCount).toBe(0);
  });

  it('sends the palette once and resends it only when it grew', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 0, y: 0, z: 0 }, STONE);
    const { factory, flush, posted } = queuedBackend();
    const s = new ChunkScheduler(registry, textures, stubSink().sink, factory);
    s.setDocument(doc);
    s.update();
    flush();
    doc.setBlock({ x: 1, y: 0, z: 0 }, STONE);
    s.update();
    flush();
    doc.setBlock({ x: 2, y: 0, z: 0 }, DIRT);
    s.update();
    const inits = posted.filter((r) => r.type === 'init');
    expect(inits.length).toBe(2);
    const last = inits[1];
    expect(last?.type === 'init' && last.palette.map((p) => p.state)).toEqual([AIR, STONE, DIRT]);
    expect(s.paletteInfo.length).toBe(3);
  });

  it('coalesces requests per chunk while one is in flight', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 5, y: 5, z: 5 }, STONE);
    const { factory, flush, posted } = queuedBackend();
    const { sink, log } = stubSink();
    const s = new ChunkScheduler(registry, textures, sink, factory);
    s.setDocument(doc);
    s.update();
    doc.setBlock({ x: 6, y: 5, z: 5 }, STONE);
    s.update();
    doc.setBlock({ x: 7, y: 5, z: 5 }, STONE);
    s.update();
    expect(meshKeys(posted)).toEqual(['0,0,0']);
    expect(s.pending).toBe(1);
    flush(); // answer for the first request → applied, then one re-mesh
    expect(meshKeys(posted)).toEqual(['0,0,0', '0,0,0']);
    expect(log).toEqual(['clear', 'set 0,0,0', 'set 0,0,0']);
    expect(s.pending).toBe(0);
  });

  it('drops answers that belong to a previous document', () => {
    const a = new BuildDocument(META);
    a.setBlock({ x: 0, y: 0, z: 0 }, STONE);
    const b = new BuildDocument(META);
    b.setBlock({ x: 100, y: 0, z: 0 }, STONE);
    const { factory, flush } = queuedBackend();
    const { sink, shown } = stubSink();
    const s = new ChunkScheduler(registry, textures, sink, factory);
    s.setDocument(a);
    s.update();
    s.setDocument(b);
    s.update();
    flush();
    expect([...shown.keys()]).toEqual(['6,0,0']);
  });

  it('applies the layer limit by re-meshing with maxY (models above are dropped)', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 0, y: 0, z: 0 }, STONE);
    doc.setBlock({ x: 0, y: 1, z: 0 }, TORCH);
    doc.setBlock({ x: 0, y: 20, z: 0 }, STONE);
    const { factory, flush, posted } = queuedBackend();
    const { sink, shown, log } = stubSink();
    const s = new ChunkScheduler(registry, textures, sink, factory);
    s.setDocument(doc);
    s.update();
    flush();
    expect(shown.get('0,0,0')?.models.length).toBe(1);
    s.setLayerLimit(0);
    expect(s.layerLimit).toBe(0);
    s.update();
    const requests = posted.filter((r) => r.type === 'mesh').slice(-2);
    expect(requests.every((r) => r.type === 'mesh' && r.input.maxY === 0)).toBe(true);
    flush();
    expect(shown.get('0,0,0')?.models.length).toBe(0);
    expect(log.at(-1)).toBe('remove 0,1,0');
    s.setLayerLimit(0); // unchanged → nothing to do
    expect(s.update()).toEqual([]);
    s.setLayerLimit(null);
    expect(s.update().sort()).toEqual(['0,0,0', '0,1,0']);
  });

  it('reports mesher errors and keeps going', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 0, y: 0, z: 0 }, STONE);
    const errors: string[] = [];
    let respond: (r: MesherResponse) => void = () => undefined;
    const s = new ChunkScheduler(
      registry,
      textures,
      stubSink().sink,
      (cb) => {
        respond = cb;
        return { post: () => undefined, dispose: () => undefined };
      },
      (m) => errors.push(m),
    );
    s.setDocument(doc);
    s.update();
    respond({ type: 'error', id: 1, message: 'boom' });
    expect(errors).toEqual(['Meshing chunk 0,0,0 failed: boom']);
    expect(s.pending).toBe(0);
  });
});

describe('createWorkerBackend', () => {
  it('wires messages, transfers buffers and terminates', () => {
    const sent: { message: unknown; transfer: Transferable[] }[] = [];
    let terminated = false;
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: (message, transfer) => sent.push({ message, transfer }),
      terminate: () => {
        terminated = true;
      },
    };
    const responses: MesherResponse[] = [];
    const errors: string[] = [];
    const backend = createWorkerBackend(
      worker,
      (r) => responses.push(r),
      (e) => errors.push(e),
    );
    const buf = new ArrayBuffer(8);
    backend.post({ type: 'init', palette: [], textures: {} }, [buf]);
    expect(sent[0]?.transfer).toEqual([buf]);
    const response: MesherResponse = { type: 'error', id: 3, message: 'x' };
    worker.onmessage?.({ data: response } as MessageEvent);
    worker.onerror?.({ message: 'bad' } as ErrorEvent);
    expect(responses).toEqual([response]);
    expect(errors).toEqual(['bad']);
    backend.dispose();
    expect(terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
  });
});
