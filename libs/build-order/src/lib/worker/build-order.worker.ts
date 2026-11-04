import type { BuildOrderRequest, BuildOrderResponse } from '../api';
import { handleBuildOrderRequest } from './handle-request';

/*
 * Web Worker entry for the build-order engine. Engine libs compile without
 * the DOM lib, so the minimal worker global is declared here.
 * Usage: new Worker(new URL('./build-order.worker', import.meta.url), { type: 'module' }).
 */

interface MinimalWorkerScope {
  postMessage(message: BuildOrderResponse): void;
  onmessage: ((event: { readonly data: BuildOrderRequest }) => void) | null;
}

declare const self: MinimalWorkerScope;

self.onmessage = (event) => handleBuildOrderRequest(event.data, (r) => self.postMessage(r));
