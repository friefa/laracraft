import { Injectable, InjectionToken, inject } from '@angular/core';
import type { BuildDocument } from '@laracraft/core-model';
import type { BuildSummary } from './build-store.types';
import { IndexedDbBuildStore } from './indexeddb-build-store';

/** IndexedDB factory used by the default store; overridable in tests. */
export const IDB_FACTORY = new InjectionToken<IDBFactory | undefined>('IDB_FACTORY', {
  providedIn: 'root',
  factory: () => (typeof indexedDB === 'undefined' ? undefined : indexedDB),
});

/**
 * Local, offline-first persistence of builds. All methods reject with
 * `BuildStoreError` (see `build-store.types.ts`). Inject `BuildStore`; replace it
 * in tests with a mock. The default implementation uses IndexedDB on every
 * platform (it works in Capacitor WebViews, too).
 */
@Injectable({
  providedIn: 'root',
  useFactory: () => new IndexedDbBuildStore(inject(IDB_FACTORY)),
})
export abstract class BuildStore {
  /** All builds, most recently updated first. Reads summaries only. */
  abstract list(): Promise<BuildSummary[]>;
  abstract load(id: string): Promise<BuildDocument>;
  /**
   * Stores the document under `id` (creates or replaces). Sets
   * `doc.metadata.updatedAt` to the current time.
   */
  abstract save(id: string, doc: BuildDocument): Promise<BuildSummary>;
  /** Creates an empty build and returns its id. */
  abstract create(name: string): Promise<string>;
  abstract rename(id: string, name: string): Promise<BuildSummary>;
  /** Copies a build under a new id and returns that id. */
  abstract duplicate(id: string, name: string): Promise<string>;
  abstract delete(id: string): Promise<void>;
  /** The build as a format v1 file (`application/json`). Async: it reads from storage. */
  abstract exportFile(id: string): Promise<Blob>;
  /** Validates and stores a format v1 file as a new build; returns its id. */
  abstract importFile(file: Blob): Promise<string>;
}
