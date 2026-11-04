/** localStorage key of the "gathered materials" checklist of a build. */
export function checklistKey(buildId: string): string {
  return `laracraft.guide.checklist.${buildId}`;
}

/** The storage, or undefined when access throws (sandboxed iframes, disabled storage). */
export function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Ticked item ids; empty on missing, corrupt or inaccessible storage. */
export function loadChecklist(storage: Storage | undefined, buildId: string): Set<string> {
  try {
    const raw = storage?.getItem(checklistKey(buildId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Persists the ticked items (removes the entry when empty). Never throws. */
export function saveChecklist(
  storage: Storage | undefined,
  buildId: string,
  items: ReadonlySet<string>,
): void {
  try {
    if (items.size === 0) storage?.removeItem(checklistKey(buildId));
    else storage?.setItem(checklistKey(buildId), JSON.stringify([...items].sort()));
  } catch {
    // Quota exceeded or storage blocked: the checklist just isn't remembered.
  }
}
