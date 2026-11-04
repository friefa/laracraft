import {
  BuildDocument,
  deserializeBuild,
  serializeBuildToString,
  type BlockStateString,
} from '@laracraft/core-model';
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { BuildStoreError, type BuildStoreErrorCode } from './build-store.types';
import { DEFAULT_DATA_VERSION, IndexedDbBuildStore, readBlobText } from './indexeddb-build-store';

const STONE = 'minecraft:stone' as BlockStateString;
const DIRT = 'minecraft:dirt' as BlockStateString;

function makeStore(options: { maxImportBytes?: number } = {}) {
  let t = Date.parse('2026-11-04T10:00:00Z');
  let n = 0;
  const factory = new IDBFactory();
  const store = new IndexedDbBuildStore(factory, {
    ...options,
    // Each call advances the clock by one minute so ordering is deterministic.
    now: () => new Date((t += 60_000)),
    newId: () => `id-${++n}`,
  });
  return { store, factory };
}

async function expectCode(promise: Promise<unknown>, code: BuildStoreErrorCode) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BuildStoreError);
  expect((err as BuildStoreError).code).toBe(code);
}

function fileOf(text: string, name = 'test.lcb.json'): File {
  return new File([text], name, { type: 'application/json' });
}

describe('IndexedDbBuildStore', () => {
  let store: IndexedDbBuildStore;

  beforeEach(() => {
    ({ store } = makeStore());
  });

  afterEach(() => store.close());

  it('starts empty', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('creates builds with Java metadata and ISO timestamps', async () => {
    const id = await store.create('  Castle  ');
    expect(id).toBe('id-1');
    const doc = await store.load(id);
    expect(doc.metadata).toEqual({
      name: 'Castle',
      edition: 'java',
      dataVersion: DEFAULT_DATA_VERSION,
      createdAt: '2026-11-04T10:01:00.000Z',
      updatedAt: '2026-11-04T10:01:00.000Z',
    });
    expect(doc.volume.blockCount).toBe(0);
    expect(await store.list()).toEqual([
      {
        id,
        name: 'Castle',
        createdAt: '2026-11-04T10:01:00.000Z',
        updatedAt: '2026-11-04T10:01:00.000Z',
        blockCount: 0,
        size: [0, 0, 0],
      },
    ]);
  });

  it('saves documents and keeps summaries in sync, newest first', async () => {
    const a = await store.create('A');
    const b = await store.create('B');
    const doc = await store.load(a);
    doc.setBlock({ x: 0, y: 0, z: 0 }, STONE);
    doc.setBlock({ x: 2, y: 3, z: -1 }, DIRT);
    const summary = await store.save(a, doc);

    expect(summary).toMatchObject({ id: a, blockCount: 2, size: [3, 4, 2] });
    expect(doc.metadata.updatedAt).toBe(summary.updatedAt);
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual([a, b]);
    expect(list[0]).toEqual(summary);

    const reloaded = await store.load(a);
    expect(reloaded.getBlock(2, 3, -1)).toBe(DIRT);
    expect(reloaded.volume.blockCount).toBe(2);
  });

  it('renames without touching blocks', async () => {
    const id = await store.create('Old');
    const doc = await store.load(id);
    doc.setBlock({ x: 1, y: 1, z: 1 }, STONE);
    await store.save(id, doc);

    const summary = await store.rename(id, ' New ');
    expect(summary).toMatchObject({ id, name: 'New', blockCount: 1, size: [1, 1, 1] });
    const reloaded = await store.load(id);
    expect(reloaded.metadata.name).toBe('New');
    expect(reloaded.getBlock(1, 1, 1)).toBe(STONE);
  });

  it('duplicates under a new id with fresh timestamps', async () => {
    const id = await store.create('Tower');
    const doc = await store.load(id);
    doc.setBlock({ x: 0, y: 5, z: 0 }, STONE);
    await store.save(id, doc);

    const copy = await store.duplicate(id, 'Tower (copy)');
    expect(copy).not.toBe(id);
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: copy, name: 'Tower (copy)', blockCount: 1 });
    const copyDoc = await store.load(copy);
    expect(copyDoc.getBlock(0, 5, 0)).toBe(STONE);
    expect(copyDoc.metadata.createdAt).toBe(list[0]?.createdAt);
    expect((await store.load(id)).metadata.name).toBe('Tower');
  });

  it('deletes data and summary', async () => {
    const id = await store.create('Gone');
    await store.delete(id);
    expect(await store.list()).toEqual([]);
    await expectCode(store.load(id), 'not-found');
  });

  it('reports missing builds and invalid names', async () => {
    await expectCode(store.load('nope'), 'not-found');
    await expectCode(store.rename('nope', 'x'), 'not-found');
    await expectCode(store.duplicate('nope', 'x'), 'not-found');
    await expectCode(store.exportFile('nope'), 'not-found');
    await expectCode(store.create('   '), 'invalid-name');
    await expectCode(store.create('x'.repeat(201)), 'invalid-name');
  });

  it('persists across store instances (same database)', async () => {
    const { store: first, factory } = makeStore();
    const id = await first.create('Persistent');
    await first.close();
    const second = new IndexedDbBuildStore(factory);
    expect((await second.list()).map((s) => s.name)).toEqual(['Persistent']);
    await second.close();
    expect(id).toBeTruthy();
  });

  describe('export / import', () => {
    it('round-trips a build through a format v1 file', async () => {
      const id = await store.create('Round trip');
      const doc = await store.load(id);
      doc.setBlock({ x: -3, y: 0, z: 7 }, STONE);
      doc.setBlock({ x: 0, y: 2, z: 0 }, DIRT);
      await store.save(id, doc);

      const blob = await store.exportFile(id);
      expect(blob.type).toBe('application/json');
      const text = await readBlobText(blob);
      expect(JSON.parse(text)).toMatchObject({ format: 'laracraft-build', version: 1 });
      expect(deserializeBuild(text).getBlock(-3, 0, 7)).toBe(STONE);

      const imported = await store.importFile(fileOf(text));
      expect(imported).not.toBe(id);
      const copy = await store.load(imported);
      expect(copy.metadata.name).toBe('Round trip');
      expect(copy.getBlock(-3, 0, 7)).toBe(STONE);
      expect(copy.getBlock(0, 2, 0)).toBe(DIRT);
      expect((await store.list())[0]).toMatchObject({ id: imported, blockCount: 2 });
    });

    it('imports files written by serializeBuildToString', async () => {
      const doc = new BuildDocument({
        name: 'External',
        edition: 'java',
        dataVersion: 4189,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });
      doc.setBlock({ x: 0, y: 0, z: 0 }, STONE);
      const id = await store.importFile(fileOf(serializeBuildToString(doc)));
      const [summary] = await store.list();
      expect(summary).toMatchObject({ id, name: 'External', createdAt: '2025-01-01T00:00:00Z' });
      expect(summary?.updatedAt).not.toBe('2025-01-01T00:00:00Z');
    });

    it('rejects invalid files with friendly codes', async () => {
      await expectCode(store.importFile(fileOf('not json')), 'invalid-file');
      await expectCode(store.importFile(fileOf('[]')), 'invalid-file');
      await expectCode(store.importFile(fileOf('{"format":"other"}')), 'invalid-file');
      await expectCode(
        store.importFile(fileOf('{"format":"laracraft-build","version":1,"metadata":{}}')),
        'invalid-file',
      );
      await expectCode(
        store.importFile(fileOf('{"format":"laracraft-build","version":99}')),
        'unsupported-version',
      );
      expect(await store.list()).toEqual([]);
    });

    it('rejects files above the size limit before reading them', async () => {
      const { store: small } = makeStore({ maxImportBytes: 10 });
      await expectCode(small.importFile(fileOf('x'.repeat(11))), 'too-large');
      await small.close();
    });
  });

  describe('errors', () => {
    it('reports unavailable storage', async () => {
      const none = new IndexedDbBuildStore(undefined);
      await expectCode(none.list(), 'unavailable');
    });

    it('maps quota errors', async () => {
      const id = await store.create('Big');
      const doc = await store.load(id);
      const quota = new DOMException('full', 'QuotaExceededError');
      vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(() => {
        throw quota;
      });
      try {
        await expectCode(store.save(id, doc), 'quota');
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
