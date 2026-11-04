import { DIRECTION_OFFSET, type Vec3, addVec3, equalsVec3 } from '@laracraft/core-model';
import type { Clipboard, EditorTool, Pick, ToolContext } from '../api';
import { clipboardPlacement, selectionOps } from '../selection-ops';

/**
 * Paste: a tap sets the paste position (clipboard min corner at the cell in
 * front of the clicked face) and shows a preview. Tapping the same position
 * again, or calling {@link PasteTool.confirm}, commits the paste.
 *
 * The clipboard is not part of `ToolContext`, so the tool reads it through a getter.
 */
export class PasteTool implements EditorTool {
  readonly id = 'paste' as const;
  private anchor: Vec3 | null = null;

  constructor(private readonly getClipboard: () => Clipboard | null) {}

  /** Current paste position, or null when nothing is pending. */
  get position(): Vec3 | null {
    return this.anchor;
  }

  tap(pick: Pick | null, ctx: ToolContext): void {
    const clip = this.getClipboard();
    if (!pick || !clip) return;
    const at = addVec3(pick.pos, DIRECTION_OFFSET[pick.face]);
    if (this.anchor && equalsVec3(this.anchor, at)) {
      this.confirm(ctx);
      return;
    }
    this.anchor = at;
    ctx.setPreview(clipboardPlacement(clip, at));
  }

  /** Commits the pending paste. Returns false when nothing was pending. */
  confirm(ctx: ToolContext): boolean {
    const clip = this.getClipboard();
    const at = this.anchor;
    if (!clip || !at) return false;
    const changeSet = selectionOps.paste(ctx.doc, clip, at);
    this.anchor = null;
    ctx.setPreview([]);
    ctx.commit(changeSet);
    return true;
  }

  cancel(ctx: ToolContext): void {
    this.anchor = null;
    ctx.setPreview([]);
  }
}
