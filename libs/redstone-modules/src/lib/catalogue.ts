import { OBSERVER_CLOCK, REPEATER_CLOCK } from './modules/clocks';
import { PISTON_DOOR_1X2, PISTON_DOOR_2X2 } from './modules/doors';
import { HIDDEN_LAMP_ARRAY } from './modules/lighting';
import { AND_GATE, PULSE_EXTENDER, RS_NOR_LATCH, T_FLIP_FLOP } from './modules/logic';
import { ITEM_SORTER } from './modules/sorting';
import type { ModuleCatalogue, ModuleEditions, RedstoneModule } from './types';

const MODULES: readonly RedstoneModule[] = Object.freeze([
  PISTON_DOOR_2X2,
  PISTON_DOOR_1X2,
  OBSERVER_CLOCK,
  REPEATER_CLOCK,
  T_FLIP_FLOP,
  RS_NOR_LATCH,
  AND_GATE,
  PULSE_EXTENDER,
  ITEM_SORTER,
  HIDDEN_LAMP_ARRAY,
]);

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

/** All modules of the library. Structurally compatible with the Lara DSL's `ModuleCatalogue`. */
export const MODULE_CATALOGUE: ModuleCatalogue<RedstoneModule> = {
  get: (id) => BY_ID.get(id),
  all: () => MODULES,
};

/** Modules whose status in `edition` is `tested` (what Lara may offer, ADR-0006). */
export function modulesForEdition(edition: keyof ModuleEditions): readonly RedstoneModule[] {
  return MODULES.filter((m) => m.editions[edition] === 'tested');
}
