import type { Scenario } from '../../lib/api';
import { COMPARATOR_SCENARIOS } from './comparator';
import { CONTAINER_SCENARIOS } from './containers';
import { DUST_SCENARIOS } from './dust';
import { MECHANISM_SCENARIOS } from './mechanisms';
import { OBSERVER_SCENARIOS } from './observer';
import { PISTON_SCENARIOS } from './piston';
import { REPEATER_SCENARIOS } from './repeater';
import { SENSOR_SCENARIOS } from './sensors';
import { SOURCE_SCENARIOS } from './sources';

export {
  COMPARATOR_SCENARIOS,
  CONTAINER_SCENARIOS,
  DUST_SCENARIOS,
  MECHANISM_SCENARIOS,
  OBSERVER_SCENARIOS,
  PISTON_SCENARIOS,
  REPEATER_SCENARIOS,
  SENSOR_SCENARIOS,
  SOURCE_SCENARIOS,
};

/** Java Edition behaviour scenarios grouped by mechanic. */
export const SCENARIO_GROUPS: Readonly<Record<string, readonly Scenario[]>> = {
  sources: SOURCE_SCENARIOS,
  dust: DUST_SCENARIOS,
  repeater: REPEATER_SCENARIOS,
  comparator: COMPARATOR_SCENARIOS,
  observer: OBSERVER_SCENARIOS,
  piston: PISTON_SCENARIOS,
  mechanisms: MECHANISM_SCENARIOS,
  containers: CONTAINER_SCENARIOS,
  sensors: SENSOR_SCENARIOS,
};

/** All scenarios, in group order. */
export const JAVA_SCENARIOS: readonly Scenario[] = Object.values(SCENARIO_GROUPS).flat();
