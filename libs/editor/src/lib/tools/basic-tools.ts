import { AIR, type BlockChange, type Vec3 } from '@laracraft/core-model';
import type { EditorTool } from '../api';
import { EDITOR_ACTION, selectionOps } from '../selection-ops';
import { tallPartner } from './tall-blocks';

/** Removes the picked block (and the other half of doors/tall plants). */
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
    ctx.commit({ changes, origin: 'user', label: EDITOR_ACTION.remove });
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

/** Fills the current selection with the active block. */
export const fillTool: EditorTool = {
  id: 'fill',
  tap(_pick, ctx) {
    if (!ctx.selection) return;
    ctx.commit(selectionOps.fill(ctx.doc, ctx.selection, ctx.activeState));
  },
};

/** Replaces every occurrence of the tapped block's state inside the selection with the active block. */
export const replaceTool: EditorTool = {
  id: 'replace',
  tap(pick, ctx) {
    if (!pick || !ctx.selection) return;
    const from = ctx.doc.getBlock(pick.pos.x, pick.pos.y, pick.pos.z);
    ctx.commit(selectionOps.replace(ctx.doc, ctx.selection, from, ctx.activeState));
  },
};
