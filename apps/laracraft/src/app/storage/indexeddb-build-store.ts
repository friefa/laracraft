import {
  BuildDocument,
  BuildFormatError,
  CURRENT_FORMAT_VERSION,
  FORMAT_ID,
  MAX_NAME_LENGTH,
  deserializeBuild,
  serializeBuild,
  type BuildMetadata,
} from '@laracraft/core-model';
import type { BuildStore } from './build-store';
import { BuildStoreError, MAX_IMPORT_BYTES, type BuildSummary } from './build-store.types';
import { idbRequest, idbTransaction } from './idb';

/**
 * Java data version for new builds.
 * TODO: replace with `JAVA_DATA_VERSION` from `@laracraft/core-model` once it is exported.
 */
export const DEFAULT_DATA_VERSION = 4189;

export const DB_NAME = 'laracraft';
/** Bump on every schema change and add a step to {@link upgradeSchema}. */
export const DB_VERSION = 1;
const SUMMARIES = 'summaries';
const BUILDS = 'builds';

/** Row in the `builds` store: the build as a format v1 JSON string. */
interface BuildRecord {
  id: string;
  data: string;
}

export interface IndexedDbBuildStoreOptions {
  dbName?: string;
  maxImportBytes?: number;
  now?: () => Date;
  newId?: () => string;
}

/**
 * {@link BuildStore} on IndexedDB. Summaries (`summaries`) and block data
 * (`builds`, format v1 strings) live in separate object stores so listing never
 * touches block data; both are always written in one transaction.
 */
export class IndexedDbBuildStore implements BuildStore {
  private dbPromise?: Promise<IDBDatabase>;
  private readonly dbName: string;
  private readonly maxImportBytes: number;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly factory: IDBFactory | undefined,
    options: IndexedDbBuildStoreOptions = {},
  ) {
    this.dbName = options.dbName ?? DB_NAME;
    this.maxImportBytes = options.maxImportBytes ?? MAX_IMPORT_BYTES;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomId;
  }

  async list(): Promise<BuildSummary[]> {
    return this.run(async (db) => {
      const tx = db.transaction(SUMMARIES, 'readonly');
      const all = await idbRequest<BuildSummary[]>(tx.objectStore(SUMMARIES).getAll());
      return all.sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      );
    });
  }

  async load(id: string): Promise<BuildDocument> {
    const data = await this.readData(id);
    try {
      return deserializeBuild(data);
    } catch (err) {
      throw new BuildStoreError('unknown', `Stored build ${id} is corrupt`, { cause: err });
    }
  }

  async save(id: string, doc: BuildDocument): Promise<BuildSummary> {
    doc.metadata = { ...doc.metadata, updatedAt: this.now().toISOString() };
    return this.put(id, doc);
  }

  async create(name: string): Promise<string> {
    const at = this.now().toISOString();
    const doc = new BuildDocument({
      name: validName(name),
      edition: 'java',
      dataVersion: DEFAULT_DATA_VERSION,
      createdAt: at,
      updatedAt: at,
    });
    const id = this.newId();
    await this.put(id, doc);
    return id;
  }

  async rename(id: string, name: string): Promise<BuildSummary> {
    const clean = validName(name);
    return this.rewriteMetadata(id, id, (m) => ({
      ...m,
      name: clean,
      updatedAt: this.now().toISOString(),
    }));
  }

  async duplicate(id: string, name: string): Promise<string> {
    const clean = validName(name);
    const at = this.now().toISOString();
    const copyId = this.newId();
    await this.rewriteMetadata(id, copyId, (m) => {
      const copy: BuildMetadata = { ...m, name: clean, createdAt: at, updatedAt: at };
      delete copy.remixOf;
      return copy;
    });
    return copyId;
  }

  async delete(id: string): Promise<void> {
    return this.run(async (db) => {
      const tx = db.transaction([SUMMARIES, BUILDS], 'readwrite');
      tx.objectStore(SUMMARIES).delete(id);
      tx.objectStore(BUILDS).delete(id);
      await idbTransaction(tx);
    });
  }

  async exportFile(id: string): Promise<Blob> {
    return new Blob([await this.readData(id)], { type: 'application/json' });
  }

  async importFile(file: Blob): Promise<string> {
    if (file.size > this.maxImportBytes) {
      throw new BuildStoreError('too-large', `File is larger than ${this.maxImportBytes} bytes`);
    }
    let text: string;
    try {
      text = await readBlobText(file);
    } catch (err) {
      throw new BuildStoreError('invalid-file', 'File could not be read', { cause: err });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new BuildStoreError('invalid-file', 'File is not JSON', { cause: err });
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new BuildStoreError('invalid-file', 'Not a laracraft build file');
    }
    const record = raw as Record<string, unknown>;
    if (record['format'] !== FORMAT_ID) {
      throw new BuildStoreError('invalid-file', 'Not a laracraft build file');
    }
    const version = record['version'];
    if (typeof version === 'number' && version > CURRENT_FORMAT_VERSION) {
      throw new BuildStoreError('unsupported-version', `Format version ${version} is too new`);
    }
    let doc: BuildDocument;
    try {
      doc = deserializeBuild(record);
    } catch (err) {
      const msg = err instanceof BuildFormatError ? err.message : 'Invalid build file';
      throw new BuildStoreError('invalid-file', msg, { cause: err });
    }
    const id = this.newId();
    await this.save(id, doc);
    return id;
  }

  /** Closes the connection (tests, or before deleting the database). */
  async close(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    if (pending) (await pending.catch(() => undefined))?.close();
  }

  private async put(id: string, doc: BuildDocument): Promise<BuildSummary> {
    let summary: BuildSummary;
    let record: BuildRecord;
    try {
      const file = serializeBuild(doc);
      summary = {
        id,
        name: doc.metadata.name,
        createdAt: doc.metadata.createdAt,
        updatedAt: doc.metadata.updatedAt,
        blockCount: doc.volume.blockCount,
        size: file.size,
      };
      record = { id, data: JSON.stringify(file) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Build could not be serialized';
      throw new BuildStoreError('unknown', msg, { cause: err });
    }
    await this.writeRecord(summary, record);
    return summary;
  }

  private writeRecord(summary: BuildSummary, record: BuildRecord): Promise<void> {
    return this.run(async (db) => {
      const tx = db.transaction([SUMMARIES, BUILDS], 'readwrite');
      tx.objectStore(BUILDS).put(record);
      tx.objectStore(SUMMARIES).put(summary);
      await idbTransaction(tx);
    });
  }

  private async readData(id: string): Promise<string> {
    const record = await this.run(async (db) => {
      const tx = db.transaction(BUILDS, 'readonly');
      return idbRequest<BuildRecord | undefined>(tx.objectStore(BUILDS).get(id));
    });
    if (!record) throw new BuildStoreError('not-found', `No build with id ${id}`);
    return record.data;
  }

  /**
   * Changes only the metadata of a stored build and writes it under `targetId`,
   * without decoding the block data. Stored data was written by us, so it is
   * valid format v1; the metadata is still re-validated on the next load.
   */
  private async rewriteMetadata(
    id: string,
    targetId: string,
    change: (m: BuildMetadata) => BuildMetadata,
  ): Promise<BuildSummary> {
    const file = JSON.parse(await this.readData(id)) as { metadata: BuildMetadata };
    file.metadata = change(file.metadata);
    const current = await this.run(async (db) => {
      const tx = db.transaction(SUMMARIES, 'readonly');
      return idbRequest<BuildSummary | undefined>(tx.objectStore(SUMMARIES).get(id));
    });
    if (!current) throw new BuildStoreError('not-found', `No build with id ${id}`);
    const summary: BuildSummary = {
      ...current,
      id: targetId,
      name: file.metadata.name,
      createdAt: file.metadata.createdAt,
      updatedAt: file.metadata.updatedAt,
    };
    await this.writeRecord(summary, { id: targetId, data: JSON.stringify(file) });
    return summary;
  }

  private async run<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await this.open();
    try {
      return await fn(db);
    } catch (err) {
      throw toStoreError(err);
    }
  }

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= this.openDb().catch((err: unknown) => {
      // Allow a retry later (e.g. after the user freed space or left private mode).
      this.dbPromise = undefined;
      throw toStoreError(err, 'unavailable');
    });
    return this.dbPromise;
  }

  private async openDb(): Promise<IDBDatabase> {
    if (!this.factory) throw new BuildStoreError('unavailable', 'IndexedDB is not available');
    const request = this.factory.open(this.dbName, DB_VERSION);
    request.onupgradeneeded = (event) => {
      upgradeSchema(request.result, event.oldVersion);
    };
    request.onblocked = () => {
      console.warn('laracraft storage upgrade is blocked by another open tab');
    };
    const db = await idbRequest(request);
    // Another tab wants to upgrade the schema: step aside, reopen lazily next time.
    db.onversionchange = () => {
      db.close();
      this.dbPromise = undefined;
    };
    db.onclose = () => {
      this.dbPromise = undefined;
    };
    void requestPersistence();
    return db;
  }
}

/** Schema migrations; each step runs once, in order, inside the upgrade transaction. */
function upgradeSchema(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const summaries = db.createObjectStore(SUMMARIES, { keyPath: 'id' });
    summaries.createIndex('updatedAt', 'updatedAt');
    db.createObjectStore(BUILDS, { keyPath: 'id' });
  }
  // if (oldVersion < 2) { … }
}

function validName(name: string): string {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > MAX_NAME_LENGTH) {
    throw new BuildStoreError('invalid-name', `Name must have 1–${MAX_NAME_LENGTH} characters`);
  }
  return clean;
}

function toStoreError(err: unknown, fallback: 'unknown' | 'unavailable' = 'unknown') {
  if (err instanceof BuildStoreError) return err;
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'QuotaExceededError') {
    return new BuildStoreError('quota', 'Not enough storage space', { cause: err });
  }
  if (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError') {
    return new BuildStoreError('unavailable', 'Storage is not available', { cause: err });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new BuildStoreError(fallback, msg, { cause: err });
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** `Blob.text()` with a FileReader fallback (older WebViews, jsdom). */
export function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Asks the browser not to evict our data under storage pressure (best effort). */
async function requestPersistence(): Promise<void> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (storage?.persist && !(await storage.persisted())) await storage.persist();
  } catch {
    // Not supported or denied; data still persists, just evictable.
  }
}
