import { Capacitor } from '@capacitor/core';

export type SaveFileResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a file to the user. On native platforms (Capacitor), where anchor
 * downloads of blob URLs do not work, the system share sheet is used when the
 * Web Share API supports files; everywhere else the file is downloaded via an
 * anchor.
 */
export async function saveFile(
  blob: Blob,
  fileName: string,
  doc: Document,
  isNative: () => boolean = () => Capacitor.isNativePlatform(),
): Promise<SaveFileResult> {
  const nav = doc.defaultView?.navigator;
  if (isNative() && nav?.share && nav.canShare) {
    const file = new File([blob], fileName, { type: blob.type || 'application/json' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName });
        return 'shared';
      } catch (err) {
        if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled';
        // Otherwise fall through to a download attempt.
      }
    }
  }
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
  return 'downloaded';
}
