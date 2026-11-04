import type { ChatMessage } from '@laracraft/lara-agent';
import { IDBFactory } from 'fake-indexeddb';
import { BuildStoreError } from './build-store.types';
import { EMPTY_CHAT, IndexedDbChatHistoryStore, MAX_STORED_MESSAGES } from './chat-history-store';
import { IndexedDbBuildStore } from './indexeddb-build-store';

const user = (id: string, text = 'Bau mir ein Haus'): ChatMessage => ({
  role: 'user',
  id,
  text,
  at: '2026-11-04T10:00:00Z',
});
const lara = (id: string): ChatMessage => ({
  role: 'lara',
  id,
  text: 'Fertig!',
  at: '2026-11-04T10:00:05Z',
  operations: [{ op: 'wall', changed: 48 }],
  usage: { inputTokens: 1200, outputTokens: 300 },
});

describe('IndexedDbChatHistoryStore', () => {
  it('returns an empty chat for unknown builds', async () => {
    const chats = new IndexedDbChatHistoryStore(new IDBFactory());
    expect(await chats.load('nope')).toEqual(EMPTY_CHAT);
  });

  it('saves and loads a chat per build', async () => {
    const chats = new IndexedDbChatHistoryStore(new IDBFactory());
    await chats.save('a', { messages: [user('1'), lara('2')], undone: ['2'] });
    await chats.save('b', { messages: [user('3')], undone: [] });
    expect(await chats.load('a')).toEqual({ messages: [user('1'), lara('2')], undone: ['2'] });
    expect((await chats.load('b')).messages).toHaveLength(1);
    await chats.delete('a');
    expect(await chats.load('a')).toEqual(EMPTY_CHAT);
  });

  it('keeps only the newest messages and drops stale undo marks', async () => {
    const chats = new IndexedDbChatHistoryStore(new IDBFactory());
    const messages = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => user(`m${i}`));
    await chats.save('a', { messages, undone: ['m0', `m${MAX_STORED_MESSAGES + 4}`] });
    const loaded = await chats.load('a');
    expect(loaded.messages).toHaveLength(MAX_STORED_MESSAGES);
    expect(loaded.messages[0]?.id).toBe('m5');
    expect(loaded.undone).toEqual([`m${MAX_STORED_MESSAGES + 4}`]);
  });

  it('is deleted together with its build', async () => {
    const factory = new IDBFactory();
    const builds = new IndexedDbBuildStore(factory);
    const chats = new IndexedDbChatHistoryStore(factory);
    const id = await builds.create('Haus');
    await chats.save(id, { messages: [user('1')], undone: [] });
    await builds.delete(id);
    expect(await chats.load(id)).toEqual(EMPTY_CHAT);
  });

  it('upgrades a version 1 database without losing builds', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const req = factory.open('laracraft', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('summaries', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('builds', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const chats = new IndexedDbChatHistoryStore(factory);
    await chats.save('x', { messages: [user('1')], undone: [] });
    expect((await chats.load('x')).messages).toHaveLength(1);
    await chats.close();
  });

  it('reports unavailable storage', async () => {
    const chats = new IndexedDbChatHistoryStore(undefined);
    await expect(chats.load('a')).rejects.toBeInstanceOf(BuildStoreError);
  });
});
