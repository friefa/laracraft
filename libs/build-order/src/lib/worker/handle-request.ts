import {
  createJavaBlockRegistry,
  deserializeBuild,
  type BlockRegistry,
} from '@laracraft/core-model';
import type { BuildOrderRequest, BuildOrderResponse } from '../api';
import { planBuildWithProgress } from '../planner/plan-build';

let registry: BlockRegistry | undefined;

/**
 * Handles one worker request. A pure function of the message so it can be
 * tested without a worker; the worker entry only wires it to `self`.
 */
export function handleBuildOrderRequest(
  request: BuildOrderRequest,
  post: (response: BuildOrderResponse) => void,
): void {
  const id = request.id;
  try {
    if (request.type !== 'plan') throw new Error('Unknown request type');
    registry ??= createJavaBlockRegistry();
    const doc = deserializeBuild(request.file as unknown as Record<string, unknown>);
    const plan = planBuildWithProgress(doc, registry, request.options, (done, total) =>
      post({ type: 'progress', id, done, total }),
    );
    post({ type: 'result', id, plan });
  } catch (e) {
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
}
