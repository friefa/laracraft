import { AutosaveController } from './autosave';

function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AutosaveController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces saves until 1 s after the last change', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveController(save);

    autosave.markDirty();
    expect(autosave.state()).toBe('dirty');
    await vi.advanceTimersByTimeAsync(800);
    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(800);
    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.state()).toBe('saved');
    expect(autosave.isDirty).toBe(false);

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('honours a custom delay', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveController(save, { delayMs: 200 });
    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately and does nothing when clean', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveController(save);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
    autosave.markDirty();
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never overlaps saves and saves changes made during a save', async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const autosave = new AutosaveController(save);

    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    expect(autosave.state()).toBe('saving');
    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    // Second save waits for the first one.
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.state()).toBe('saved');
  });

  it('keeps changes dirty after a failed save and retries on the next change', async () => {
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const autosave = new AutosaveController(save, { onError });

    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    expect(autosave.state()).toBe('error');
    expect(autosave.isDirty).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.state()).toBe('saved');
  });

  it('saves right away when the page is hidden or closed', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveController(save, { document });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    autosave.markDirty();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);

    autosave.markDirty();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);

    // Becoming visible does not save.
    visibility.mockReturnValue('visible');
    autosave.markDirty();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);

    await autosave.dispose();
    expect(save).toHaveBeenCalledTimes(3);
    visibility.mockRestore();
  });

  it('stops listening and ignores changes after dispose', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = new AutosaveController(save, { document });
    await autosave.dispose();
    autosave.markDirty();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
