import {
  AIR,
  type BlockChange,
  DIRECTION_OFFSET,
  type Vec3,
  addVec3,
  isValidCoordinate,
} from '@laracraft/core-model';
import type { EditorTool } from '../api';
import { placementStateFor } from '../placement';
import { EDITOR_ACTION } from '../selection-ops';
import { tallPartner } from './tall-blocks';

const insideWorld = (p: Vec3): boolean =>
  isValidCoordinate(p.x) && isValidCoordinate(p.y) && isValidCoordinate(p.z);

/**
 * Places the active block against the clicked face (`pick.pos + face offset`).
 * Occupied target cells and taps on empty space are no-ops. Two-tall blocks
 * (doors) also place their upper half and need both cells free.
 */
export const placeTool: EditorTool = {
  id: 'place',
  tap(pick, ctx) {
    if (!pick) return;
    const pos = addVec3(pick.pos, DIRECTION_OFFSET[pick.face]);
    if (!insideWorld(pos) || ctx.doc.getBlock(pos.x, pos.y, pos.z) !== AIR) return;
    const state = placementStateFor(ctx.registry, ctx.activeState, pick, ctx.lookHorizontal);
    if (state === AIR) return;
    const changes: BlockChange[] = [{ pos, before: AIR, after: state }];
    const partner = tallPartner(ctx.registry, state, pos);
    if (partner) {
      const p = partner.pos;
      if (!insideWorld(p) || ctx.doc.getBlock(p.x, p.y, p.z) !== AIR) return;
      changes.push({ pos: p, before: AIR, after: partner.state });
    }
    ctx.commit({ changes, origin: 'user', label: EDITOR_ACTION.place });
  },
};
