import { Injectable, inject } from '@angular/core';
import type { ChatMessage } from '@laracraft/lara-agent';
import { IDB_FACTORY } from './build-store';
import { idbRequest, idbTransaction } from './idb';
import { CHATS, DB_NAME, openLaracraftDb, toStoreError } from './indexeddb-build-store';

/** The visible Lara conversation of one build, as the chat panel shows it. */
export interface StoredChat {
  readonly messages: readonly ChatMessage[];
  /** Ids of Lara turns the user took back with "Undo" (shown as undone). */
  readonly undone: readonly string[];
}

export const EMPTY_CHAT: StoredChat = Object.freeze({ messages: [], undone: [] });

/** Oldest messages are dropped beyond this many (keeps the record and the prompt small). */
export const MAX_STORED_MESSAGES = 200;

/**
 * Lara chat history per build, kept apart from the build data (own object store, never in
 * exports). `BuildStore.delete` removes a build's chat in the same transaction.
 * Methods reject with `BuildStoreError`.
 */
@Injectable({
  providedIn: 'root',
  useFactory: () => new IndexedDbChatHistoryStore(inject(IDB_FACTORY)),
})
export abstract class ChatHistoryStore {
  /** The stored chat, or {@link EMPTY_CHAT} when there is none. */
  abstract load(buildId: string): Promise<StoredChat>;
  abstract save(buildId: string, chat: StoredChat): Promise<void>;
  abstract delete(buildId: string): Promise<void>;
}

interface ChatRecord extends StoredChat {
  readonly id: string;
}

export class IndexedDbChatHistoryStore implements ChatHistoryStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private readonly factory: IDBFactory | undefined,
    private readonly dbName: string = DB_NAME,
  ) {}

  async load(buildId: string): Promise<StoredChat> {
    const record = await this.run(async (db) => {
      const tx = db.transaction(CHATS, 'readonly');
      return idbRequest<ChatRecord | undefined>(tx.objectStore(CHATS).get(buildId));
    });
    if (!record || !Array.isArray(record.messages)) return EMPTY_CHAT;
    return {
      messages: record.messages,
      undone: Array.isArray(record.undone) ? record.undone : [],
    };
  }

  async save(buildId: string, chat: StoredChat): Promise<void> {
    const messages = chat.messages.slice(-MAX_STORED_MESSAGES);
    const ids = new Set(messages.map((m) => m.id));
    const record: ChatRecord = {
      id: buildId,
      messages,
      undone: chat.undone.filter((id) => ids.has(id)),
    };
    await this.run(async (db) => {
      const tx = db.transaction(CHATS, 'readwrite');
      tx.objectStore(CHATS).put(record);
      await idbTransaction(tx);
    });
  }

  async delete(buildId: string): Promise<void> {
    await this.run(async (db) => {
      const tx = db.transaction(CHATS, 'readwrite');
      tx.objectStore(CHATS).delete(buildId);
      await idbTransaction(tx);
    });
  }

  /** Closes the connection (tests). */
  async close(): Promise<void> {
    const pending = this.dbPromise;
    this.dbPromise = undefined;
    if (pending) (await pending.catch(() => undefined))?.close();
  }

  private async run<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    this.dbPromise ??= openLaracraftDb(this.factory, this.dbName, () => {
      this.dbPromise = undefined;
    }).catch((err: unknown) => {
      this.dbPromise = undefined;
      throw toStoreError(err, 'unavailable');
    });
    const db = await this.dbPromise;
    try {
      return await fn(db);
    } catch (err) {
      throw toStoreError(err);
    }
  }
}
