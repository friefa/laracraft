import type { BlockState } from '../blockstate/blockstate';
import type { Direction } from '../math/direction';
import {
  FACE_SUPPORT_ORDER,
  type BlockDefinition,
  type FaceSupport,
  type FaceSupportSpec,
  type SupportRule,
} from './types';

const FULL: FaceSupportSpec = { up: 'full', down: 'full', side: 'full' };
const NONE: FaceSupportSpec = { up: 'none', down: 'none', side: 'none' };

/** Support offered by `face` of a block in `state` (`def` undefined = air/unknown → none). */
export function faceSupport(
  def: BlockDefinition | undefined,
  state: BlockState,
  face: Direction,
): FaceSupport {
  if (!def) return 'none';
  let spec: FaceSupportSpec = def.solid ? FULL : NONE;
  if (def.supportFaces) {
    spec = def.supportFaces.default;
    for (const c of def.supportFaces.cases ?? []) {
      if (Object.entries(c.when).every(([k, v]) => state.properties[k] === v)) {
        spec = c.faces;
        break;
      }
    }
  }
  return face === 'up' ? spec.up : face === 'down' ? spec.down : spec.side;
}

/** True if `offered` satisfies `needed`. `needed: 'none'` is satisfied by any block. */
export function satisfiesSupport(offered: FaceSupport, needed: FaceSupport): boolean {
  return FACE_SUPPORT_ORDER[offered] >= FACE_SUPPORT_ORDER[needed];
}

/** Minimum support a rule requires (default `full`). */
export function requiredSupport(rule: SupportRule): FaceSupport {
  return 'needs' in rule && rule.needs !== undefined ? rule.needs : 'full';
}
