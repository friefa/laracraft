import { BuildStoreError, STORAGE_ERROR_KEYS, buildStoreErrorCode } from './build-store.types';
import { isShareCancelled, type NativeFiles } from './native-files';
import { EXPORT_CACHE_DIR, EXPORT_CACHE_MAX_AGE_MS, saveFile } from './save-file';

const NOW = 1_800_000_000_000;
const URI = 'file:///data/cache/exports/x/My Castle.lcb.json';

function mockNative(overrides: Partial<NativeFiles> = {}) {
  const base = {
    isNative: vi.fn<NativeFiles['isNative']>(() => true),
    writeCacheFile: vi.fn<NativeFiles['writeCacheFile']>(() => Promise.resolve(URI)),
    listCacheDir: vi.fn<NativeFiles['listCacheDir']>(() => Promise.resolve([])),
    removeCacheDir: vi.fn<NativeFiles['removeCacheDir']>(() => Promise.resolve()),
    shareFile: vi.fn<NativeFiles['shareFile']>(() => Promise.resolve()),
  };
  return { ...base, ...overrides } as typeof base;
}

const blob = () => new Blob(['{"format":"laracraft-build"}'], { type: 'application/json' });

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(BuildStoreError);
  expect(buildStoreErrorCode(err)).toBe(code);
}

describe('saveFile', () => {
  describe('native', () => {
    it('writes the file to the cache and opens the share sheet with its URI', async () => {
      const native = mockNative();
      const result = await saveFile(blob(), 'My Castle.lcb.json', document, native, () => NOW);

      expect(result).toBe('shared');
      expect(native.writeCacheFile).toHaveBeenCalledWith(
        `${EXPORT_CACHE_DIR}/${NOW}/My Castle.lcb.json`,
        '{"format":"laracraft-build"}',
      );
      expect(native.shareFile).toHaveBeenCalledWith(URI, 'My Castle.lcb.json');
    });

    it('does not use an anchor download', async () => {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);
      try {
        await saveFile(blob(), 'a.lcb.json', document, mockNative(), () => NOW);
        expect(click).not.toHaveBeenCalled();
      } finally {
        click.mockRestore();
      }
    });

    it('treats a dismissed share sheet as cancellation, not as an error', async () => {
      const native = mockNative({
        shareFile: vi.fn(() => Promise.reject(new Error('Share canceled'))),
      });
      await expect(saveFile(blob(), 'a.lcb.json', document, native, () => NOW)).resolves.toBe(
        'cancelled',
      );
    });

    it('maps a failing share sheet to share-failed', async () => {
      const native = mockNative({
        shareFile: vi.fn(() => Promise.reject(new Error('No Activity found'))),
      });
      await expectCode(
        saveFile(blob(), 'a.lcb.json', document, native, () => NOW),
        'share-failed',
      );
    });

    it('maps write errors to export-failed and full disks to quota', async () => {
      const failing = mockNative({
        writeCacheFile: vi.fn(() => Promise.reject(new Error('FILE_NOTCREATED'))),
      });
      await expectCode(
        saveFile(blob(), 'a.lcb.json', document, failing, () => NOW),
        'export-failed',
      );
      expect(failing.shareFile).not.toHaveBeenCalled();

      const full = mockNative({
        writeCacheFile: vi.fn(() => Promise.reject(new Error('ENOSPC: no space left on device'))),
      });
      await expectCode(
        saveFile(blob(), 'a.lcb.json', document, full, () => NOW),
        'quota',
      );
    });

    it('removes stale exports but keeps recent ones', async () => {
      const recent = String(NOW - 1000);
      const old = String(NOW - EXPORT_CACHE_MAX_AGE_MS - 1);
      const native = mockNative({
        listCacheDir: vi.fn(() => Promise.resolve([recent, old, 'junk', String(NOW + 60_000)])),
      });
      await saveFile(blob(), 'a.lcb.json', document, native, () => NOW);

      const removed = native.removeCacheDir.mock.calls.map(([p]) => p).sort();
      expect(removed).toEqual(
        [
          `${EXPORT_CACHE_DIR}/${old}`,
          `${EXPORT_CACHE_DIR}/junk`,
          `${EXPORT_CACHE_DIR}/${NOW + 60_000}`,
        ].sort(),
      );
      expect(native.listCacheDir).toHaveBeenCalledWith(EXPORT_CACHE_DIR);
    });

    it('still exports when cleanup fails', async () => {
      const native = mockNative({
        listCacheDir: vi.fn(() => Promise.resolve(['1'])),
        removeCacheDir: vi.fn(() => Promise.reject(new Error('busy'))),
      });
      await expect(saveFile(blob(), 'a.lcb.json', document, native, () => NOW)).resolves.toBe(
        'shared',
      );

      const listing = mockNative({ listCacheDir: vi.fn(() => Promise.reject(new Error('x'))) });
      await expect(saveFile(blob(), 'a.lcb.json', document, listing, () => NOW)).resolves.toBe(
        'shared',
      );
    });
  });

  describe('web', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('downloads via a temporary anchor and never touches native plugins', async () => {
      const native = mockNative({ isNative: vi.fn(() => false) });
      const createObjectURL = vi.fn(() => 'blob:mock');
      const revokeObjectURL = vi.fn();
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      const clickedAnchors: HTMLAnchorElement[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clickedAnchors.push(this);
      });
      try {
        const result = await saveFile(blob(), 'a.lcb.json', document, native);

        expect(result).toBe('downloaded');
        const clicked = clickedAnchors[0];
        expect(clickedAnchors).toHaveLength(1);
        expect(clicked?.download).toBe('a.lcb.json');
        expect(clicked?.getAttribute('href')).toBe('blob:mock');
        expect(clicked?.isConnected).toBe(false);
        expect(native.writeCacheFile).not.toHaveBeenCalled();
        expect(native.shareFile).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
      } finally {
        click.mockRestore();
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }
    });
  });
});

describe('isShareCancelled', () => {
  it('recognises plugin and Web Share cancellations', () => {
    expect(isShareCancelled(new Error('Share canceled'))).toBe(true);
    expect(isShareCancelled({ name: 'AbortError', message: '' })).toBe(true);
    expect(isShareCancelled(new Error('Unsupported url'))).toBe(false);
    expect(isShareCancelled(null)).toBe(false);
  });
});

describe('STORAGE_ERROR_KEYS', () => {
  it('has a message for the export error codes', () => {
    expect(STORAGE_ERROR_KEYS['export-failed']).toBe('storage.errors.exportFailed');
    expect(STORAGE_ERROR_KEYS['share-failed']).toBe('storage.errors.shareFailed');
  });
});
