import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Where the user's provider API key lives (ADR-0008 §3). Never log the value.
 *
 * - `native`: iOS Keychain / Android Keystore via `capacitor-secure-storage-plugin`.
 * - `web`: `sessionStorage` (gone when the tab closes) unless the user explicitly asks to
 *   remember it on this device, then `localStorage` (unencrypted; the UI warns).
 */
export interface SecretStore {
  readonly kind: 'native' | 'web';
  get(): Promise<string | null>;
  /** `persist` only matters on the web (native storage is always persistent and encrypted). */
  set(value: string, opts: { readonly persist: boolean }): Promise<void>;
  clear(): Promise<void>;
}

export const LARA_KEY_NAME = 'laracraft.lara.apiKey';

/** Secure native storage (lazy: the plugin is only loaded inside the app shells). */
export function nativeSecretStore(): SecretStore {
  const plugin = () => import('capacitor-secure-storage-plugin').then((m) => m.SecureStoragePlugin);
  return {
    kind: 'native',
    async get() {
      try {
        const { value } = await (await plugin()).get({ key: LARA_KEY_NAME });
        return value || null;
      } catch {
        // The plugin rejects when the key does not exist.
        return null;
      }
    },
    async set(value) {
      await (await plugin()).set({ key: LARA_KEY_NAME, value });
    },
    async clear() {
      try {
        await (await plugin()).remove({ key: LARA_KEY_NAME });
      } catch {
        /* nothing stored */
      }
    },
  };
}

/** Browser storage: session by default, local only on explicit request. */
export function webSecretStore(
  session: Storage | undefined,
  local: Storage | undefined,
): SecretStore {
  const read = (s: Storage | undefined) => {
    try {
      return s?.getItem(LARA_KEY_NAME) || null;
    } catch {
      return null;
    }
  };
  const remove = (s: Storage | undefined) => {
    try {
      s?.removeItem(LARA_KEY_NAME);
    } catch {
      /* unavailable */
    }
  };
  return {
    kind: 'web',
    async get() {
      return read(session) ?? read(local);
    },
    async set(value, { persist }) {
      const target = persist ? local : session;
      if (!target) throw new Error('Storage is not available');
      target.setItem(LARA_KEY_NAME, value);
      remove(persist ? session : local);
    },
    async clear() {
      remove(session);
      remove(local);
    },
  };
}

function storageOf(doc: Document, name: 'sessionStorage' | 'localStorage'): Storage | undefined {
  try {
    return doc.defaultView?.[name] ?? undefined;
  } catch {
    return undefined;
  }
}

export const LARA_SECRET_STORE = new InjectionToken<SecretStore>('LARA_SECRET_STORE', {
  providedIn: 'root',
  factory: () => {
    if (Capacitor.isNativePlatform()) return nativeSecretStore();
    const doc = inject(DOCUMENT);
    return webSecretStore(storageOf(doc, 'sessionStorage'), storageOf(doc, 'localStorage'));
  },
});
