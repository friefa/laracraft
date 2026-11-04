import {
  AIR,
  type BlockChange,
  DIRECTION_OFFSET,
  type Vec3,
  addVec3,
  isValidCoordinate,
} from '@laracraft/core-model';
import type { EditorTool, Pick as VoxelPick, ToolContext } from '../api';
import { placementStateFor } from '../placement';
import { EDITOR_ACTION } from '../selection-ops';
import { withShapeUpdates } from '../shape-updates';
import { tallPartner } from './tall-blocks';

const insideWorld = (p: Vec3): boolean =>
  isValidCoordinate(p.x) && isValidCoordinate(p.y) && isValidCoordinate(p.z);

/**
 * The block changes a `place` tap on `pick` would make (before neighbour shape
 * updates), or null when nothing would be placed. Shared by the tool and the
 * hover preview, so the preview always matches the real placement.
 */
export function planPlacement(
  ctx: Pick<ToolContext, 'doc' | 'registry' | 'activeState' | 'lookHorizontal' | 'lookVertical'>,
  pick: VoxelPick | null,
): BlockChange[] | null {
  if (!pick) return null;
  const pos = addVec3(pick.pos, DIRECTION_OFFSET[pick.face]);
  if (!insideWorld(pos) || ctx.doc.getBlock(pos.x, pos.y, pos.z) !== AIR) return null;
  const state = placementStateFor(
    ctx.registry,
    ctx.activeState,
    pick,
    ctx.lookHorizontal,
    ctx.lookVertical,
  );
  if (state === AIR) return null;
  const changes: BlockChange[] = [{ pos, before: AIR, after: state }];
  const partner = tallPartner(ctx.registry, state, pos);
  if (partner) {
    const p = partner.pos;
    if (!insideWorld(p) || ctx.doc.getBlock(p.x, p.y, p.z) !== AIR) return null;
    changes.push({ pos: p, before: AIR, after: partner.state });
  }
  return changes;
}

/**
 * Places the active block against the clicked face (`pick.pos + face offset`).
 * Occupied target cells, taps on empty space and faces the block cannot be
 * placed on (torch on a ceiling) are no-ops. Two-tall blocks (doors) also place
 * their upper half and need both cells free. Neighbour-derived states (fences,
 * walls, panes, wire, stairs, chests) are updated in the same undo step.
 */
export const placeTool: EditorTool = {
  id: 'place',
  tap(pick, ctx) {
    const changes = planPlacement(ctx, pick);
    if (!changes) return;
    ctx.commit(
      withShapeUpdates(ctx.doc, ctx.registry, {
        changes,
        origin: 'user',
        label: EDITOR_ACTION.place,
      }),
    );
  },
};
