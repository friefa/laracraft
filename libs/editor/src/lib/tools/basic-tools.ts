import { AIR, type BlockChange, type Vec3 } from '@laracraft/core-model';
import type { EditorTool } from '../api';
import { EDITOR_ACTION, selectionOps } from '../selection-ops';
import { withShapeUpdates } from '../shape-updates';
import { tallPartner } from './tall-blocks';

/**
 * Removes the picked block (and the other half of doors/tall plants) and updates
 * neighbour-derived states (fences disconnect, stairs straighten …) in the same
 * undo step.
 *
 * Unlike Java, removing a supporting block does NOT remove the blocks attached to
 * it (torches, ladders, wire, buttons stay): the editor is a creative building
 * tool and never deletes cells the user did not touch. Floating attachments are
 * left for the build-order checks to report.
 */
export const removeTool: EditorTool = {
  id: 'remove',
  tap(pick, ctx) {
    if (!pick) return;
    const { pos } = pick;
    const state = ctx.doc.getBlock(pos.x, pos.y, pos.z);
    if (state === AIR) return;
    const changes: BlockChange[] = [{ pos, before: state, after: AIR }];
    const partner = tallPartner(ctx.registry, state, pos);
    if (partner) {
      const p: Vec3 = partner.pos;
      if (ctx.doc.getBlock(p.x, p.y, p.z) === partner.state) {
        changes.push({ pos: p, before: partner.state, after: AIR });
      }
    }
    ctx.commit(
      withShapeUpdates(ctx.doc, ctx.registry, {
        changes,
        origin: 'user',
        label: EDITOR_ACTION.remove,
      }),
    );
  },
};

/** Eyedropper: makes the picked block the active state (no document change). */
export const pickBlockTool: EditorTool = {
  id: 'pick-block',
  tap(pick, ctx) {
    if (!pick) return;
    const { pos } = pick;
    const state = ctx.doc.getBlock(pos.x, pos.y, pos.z);
    if (state !== AIR) ctx.setActiveState(state);
  },
};

/** Fills the current selection with the active block (neighbour shapes updated in the same step). */
export const fillTool: EditorTool = {
  id: 'fill',
  tap(_pick, ctx) {
    if (!ctx.selection) return;
    const cs = selectionOps.fill(ctx.doc, ctx.selection, ctx.activeState);
    ctx.commit(withShapeUpdates(ctx.doc, ctx.registry, cs));
  },
};

/** Replaces every occurrence of the tapped block's state inside the selection with the active block. */
export const replaceTool: EditorTool = {
  id: 'replace',
  tap(pick, ctx) {
    if (!pick || !ctx.selection) return;
    const from = ctx.doc.getBlock(pick.pos.x, pick.pos.y, pick.pos.z);
    const cs = selectionOps.replace(ctx.doc, ctx.selection, from, ctx.activeState);
    ctx.commit(withShapeUpdates(ctx.doc, ctx.registry, cs));
  },
};
