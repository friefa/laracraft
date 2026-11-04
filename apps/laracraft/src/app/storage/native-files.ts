import { Capacitor } from '@capacitor/core';

/**
 * Thin access layer to the native file plugins (Capacitor Filesystem + Share).
 * `saveFile` only talks to this interface so it can be unit-tested with a mock
 * and components never import plugins directly.
 *
 * All paths are relative to the app's cache directory.
 */
export interface NativeFiles {
  /** True inside the Android/iOS app shell. */
  isNative(): boolean;
  /** Writes a UTF-8 text file (creating parent directories) and returns its `file://` URI. */
  writeCacheFile(path: string, text: string): Promise<string>;
  /** Names of the entries in a cache directory; empty when it does not exist. */
  listCacheDir(path: string): Promise<string[]>;
  /** Recursively removes a cache directory. */
  removeCacheDir(path: string): Promise<void>;
  /**
   * Opens the system share sheet for a file URI. Rejects when the user
   * dismisses the sheet (see {@link isShareCancelled}).
   */
  shareFile(uri: string, title: string): Promise<void>;
}

/** Default implementation backed by the official Capacitor plugins (loaded lazily, native only). */
export const capacitorNativeFiles: NativeFiles = {
  isNative: () => Capacitor.isNativePlatform(),

  async writeCacheFile(path, text) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const result = await Filesystem.writeFile({
      path,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return result.uri;
  },

  async listCacheDir(path) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    try {
      const { files } = await Filesystem.readdir({ path, directory: Directory.Cache });
      return files.map((f) => f.name);
    } catch {
      // Missing directory (first export) or unreadable: nothing to clean up.
      return [];
    }
  },

  async removeCacheDir(path) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({ path, directory: Directory.Cache, recursive: true });
  },

  async shareFile(uri, title) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, files: [uri] });
  },
};

/**
 * The Share plugin rejects with "Share canceled" (Android and iOS) when the
 * user closes the sheet without picking a target; that is not an error.
 */
export function isShareCancelled(err: unknown): boolean {
  const e = err as { message?: unknown; name?: unknown; code?: unknown } | null;
  if (e?.name === 'AbortError') return true;
  const text = `${typeof e?.message === 'string' ? e.message : ''} ${typeof e?.code === 'string' ? e.code : ''}`;
  return /cancel/i.test(text);
}

/** Heuristic for "device is full" errors coming from native file APIs. */
export function isOutOfSpace(err: unknown): boolean {
  const message = (err as { message?: unknown } | null)?.message;
  return (
    typeof message === 'string' && /ENOSPC|no space|not enough space|disk full|quota/i.test(message)
  );
}
