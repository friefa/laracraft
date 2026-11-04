import { BuildStoreError } from './build-store.types';
import { readBlobText } from './indexeddb-build-store';
import {
  capacitorNativeFiles,
  isOutOfSpace,
  isShareCancelled,
  type NativeFiles,
} from './native-files';

export type SaveFileResult = 'shared' | 'downloaded' | 'cancelled';

/** Cache sub-directory holding exported files until the share target has read them. */
export const EXPORT_CACHE_DIR = 'exports';

/**
 * Exports older than this are removed on the next export. Receiving apps may
 * still read the file shortly after the share sheet closed (e.g. a background
 * upload), so the current and recent exports are kept.
 */
export const EXPORT_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Hands a file to the user.
 *
 * - Native (Capacitor): writes the file to the app cache and opens the system
 *   share sheet, so it can be saved to Files/Drive or sent to another app.
 *   Anchor downloads of blob URLs do nothing in Android WebViews.
 * - Web: downloads the file via an `<a download>` link.
 *
 * Errors on the native path are {@link BuildStoreError}s (`quota`,
 * `export-failed`, `share-failed`). A dismissed share sheet resolves to
 * `'cancelled'`.
 *
 * Import needs no native code: `<input type="file">` opens the system file
 * picker in Capacitor WebViews (Android: `BridgeWebChromeClient` maps the
 * `accept` list to MIME types, so `.json`/`application/json` files are
 * selectable; iOS: WKWebView's document picker).
 */
export async function saveFile(
  blob: Blob,
  fileName: string,
  doc: Document,
  native: NativeFiles = capacitorNativeFiles,
  now: () => number = Date.now,
): Promise<SaveFileResult> {
  if (native.isNative()) return shareNative(blob, fileName, native, now());
  downloadViaAnchor(blob, fileName, doc);
  return 'downloaded';
}

async function shareNative(
  blob: Blob,
  fileName: string,
  native: NativeFiles,
  timestamp: number,
): Promise<SaveFileResult> {
  await cleanUpOldExports(native, timestamp);

  // One directory per export keeps the user-facing file name intact while
  // never overwriting a file another app may still be reading.
  let uri: string;
  try {
    const text = await readBlobText(blob);
    uri = await native.writeCacheFile(`${EXPORT_CACHE_DIR}/${timestamp}/${fileName}`, text);
  } catch (err) {
    throw new BuildStoreError(
      isOutOfSpace(err) ? 'quota' : 'export-failed',
      'Export file could not be written',
      { cause: err },
    );
  }

  try {
    await native.shareFile(uri, fileName);
    return 'shared';
  } catch (err) {
    if (isShareCancelled(err)) return 'cancelled';
    throw new BuildStoreError('share-failed', 'Share sheet could not be opened', { cause: err });
  }
}

/** Best effort: removes exports older than {@link EXPORT_CACHE_MAX_AGE_MS}. Never throws. */
async function cleanUpOldExports(native: NativeFiles, timestamp: number): Promise<void> {
  try {
    const entries = await native.listCacheDir(EXPORT_CACHE_DIR);
    for (const name of entries) {
      const created = /^\d+$/.test(name) ? Number(name) : NaN;
      // Unknown entries and entries "from the future" (clock changes) are stale too.
      const stale =
        !Number.isFinite(created) ||
        created > timestamp ||
        timestamp - created > EXPORT_CACHE_MAX_AGE_MS;
      if (!stale) continue;
      try {
        await native.removeCacheDir(`${EXPORT_CACHE_DIR}/${name}`);
      } catch {
        // Ignore; we try again on the next export.
      }
    }
  } catch {
    // Cleanup must never block an export.
  }
}

function downloadViaAnchor(blob: Blob, fileName: string, doc: Document): void {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke once the browser has picked up the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
