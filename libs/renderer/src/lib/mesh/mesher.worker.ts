// Mesher Web Worker entry. Not exported from the package index (importing it would
// install a message handler); create it with
// `new Worker(new URL('./mesher.worker', import.meta.url), { type: 'module' })`.
import type { MesherRequest } from './types';
import { createMesherHandler } from './worker-handler';

/** The few worker globals used here (no DOM/WebWorker lib typings needed). */
interface MesherWorkerScope {
  onmessage: ((event: { readonly data: MesherRequest }) => void) | null;
  postMessage(message: unknown, transfer: readonly ArrayBuffer[]): void;
}

const scope = globalThis as unknown as MesherWorkerScope;
const handle = createMesherHandler();

scope.onmessage = (event) => {
  const reply = handle(event.data);
  if (reply) scope.postMessage(reply.response, reply.transfer);
};
