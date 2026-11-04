/** Fast list entry; stored separately from the (potentially large) block data. */
export interface BuildSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly updatedAt: string;
  /** Number of non-air blocks. */
  readonly blockCount: number;
  /** Bounding box [width (x), height (y), length (z)]; [0, 0, 0] when empty. */
  readonly size: readonly [number, number, number];
}

/**
 * Stable error codes; the UI maps them to `storage.errors.<code>` translations.
 * - `unavailable`: IndexedDB missing or blocked (private mode, sandboxed WebView …)
 * - `quota`: the device is out of storage space
 * - `not-found`: no build with that id
 * - `invalid-name`: empty or too long name
 * - `too-large`: import file exceeds the size limit
 * - `invalid-file`: import file is not a valid laracraft build
 * - `unsupported-version`: import file was written by a newer laracraft
 * - `unknown`: anything else
 */
export type BuildStoreErrorCode =
  | 'unavailable'
  | 'quota'
  | 'not-found'
  | 'invalid-name'
  | 'too-large'
  | 'invalid-file'
  | 'unsupported-version'
  | 'unknown';

export class BuildStoreError extends Error {
  constructor(
    readonly code: BuildStoreErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'BuildStoreError';
  }
}

export function buildStoreErrorCode(err: unknown): BuildStoreErrorCode {
  return err instanceof BuildStoreError ? err.code : 'unknown';
}

/** i18n key of the user-facing message for a storage error code. */
export const STORAGE_ERROR_KEYS: Readonly<Record<BuildStoreErrorCode, string>> = {
  unavailable: 'storage.errors.unavailable',
  quota: 'storage.errors.quota',
  'not-found': 'storage.errors.notFound',
  'invalid-name': 'storage.errors.invalidName',
  'too-large': 'storage.errors.tooLarge',
  'invalid-file': 'storage.errors.invalidFile',
  'unsupported-version': 'storage.errors.unsupportedVersion',
  unknown: 'storage.errors.unknown',
};

/** Default import size limit (20 MB). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** File extension of exported builds (format v1, JSON). */
export const BUILD_FILE_EXTENSION = '.lcb.json';

/** File name for an exported build, e.g. `My Castle` → `My Castle.lcb.json`. */
export function buildFileName(name: string): string {
  const safe = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return (safe || 'build') + BUILD_FILE_EXTENSION;
}
