import type { GoldenBuild } from './builder';
import { HOUSE } from './house';
import { OBSERVER_CLOCK } from './observer-clock';
import { PISTON_DOOR } from './piston-door';
import { SAND_ARCH } from './sand-arch';
import { TOWER } from './tower';
import { WATERFALL } from './waterfall';

export { GoldenDocBuilder, type GoldenBuild } from './builder';
export { HOUSE, OBSERVER_CLOCK, PISTON_DOOR, SAND_ARCH, TOWER, WATERFALL };

/** All golden builds, in the order of docs/ARCHITECTURE.md §4. */
export const GOLDEN_BUILDS: readonly GoldenBuild[] = [
  HOUSE,
  TOWER,
  SAND_ARCH,
  PISTON_DOOR,
  OBSERVER_CLOCK,
  WATERFALL,
];
