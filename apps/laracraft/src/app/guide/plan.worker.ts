import type { BuildOrderRequest } from '@laracraft/build-order';
import { handlePlanRequest } from './plan-host';

/*
 * Build-order worker of the app. Speaks the `BuildOrderRequest/Response`
 * protocol of `@laracraft/build-order` and delegates to its planner export.
 */
addEventListener('message', (event: MessageEvent<BuildOrderRequest>) => {
  void handlePlanRequest(event.data, (response) => postMessage(response));
});
