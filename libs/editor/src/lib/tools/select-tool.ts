import { type Vec3, equalsVec3 } from '@laracraft/core-model';
import type { EditorTool, Pick, PointerModifiers, ToolContext } from '../api';
import { boxFromCorners, extendBox } from '../box';

/**
 * Selection box from two corners: the first tap sets corner A (a 1×1×1 box),
 * the second sets corner B. The next tap starts a new selection. With shift,
 * a tap extends the current selection to include the tapped block. A tap on
 * empty space (no shift) clears the selection.
 */
export class SelectTool implements EditorTool {
  readonly id = 'select' as const;
  private cornerA: Vec3 | null = null;

  tap(pick: Pick | null, ctx: ToolContext, mods: PointerModifiers): void {
    if (!pick) {
      if (!mods.shift) {
        this.cornerA = null;
        ctx.setSelection(null);
      }
      return;
    }
    const pos = pick.pos;
    if (mods.shift && ctx.selection) {
      ctx.setSelection(extendBox(ctx.selection, pos));
      this.cornerA = null;
      return;
    }
    const a = this.cornerA;
    if (
      a &&
      ctx.selection &&
      equalsVec3(ctx.selection.min, a) &&
      equalsVec3(ctx.selection.max, a)
    ) {
      ctx.setSelection(boxFromCorners(a, pos));
      this.cornerA = null;
    } else {
      this.cornerA = pos;
      ctx.setSelection(boxFromCorners(pos, pos));
    }
  }

  cancel(): void {
    this.cornerA = null;
  }
}
