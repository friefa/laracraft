import {
  AIR,
  type BlockChange,
  type BlockRegistry,
  type BlockStateString,
  type Box3,
  type BuildDocument,
  type ChangeSet,
  type Vec3,
  boxSize,
  mirrorState,
  rotateStateY,
  vec3Key,
} from '@laracraft/core-model';
import { type Clipboard, MAX_EDIT_VOLUME, type SelectionOps } from './api';
import { boxCells, boxVolume, normalizeBox } from './box';

/** Thrown when an edit would touch more than {@link MAX_EDIT_VOLUME} cells. */
export class EditVolumeError extends Error {
  constructor(
    readonly volume: number,
    readonly limit: number = MAX_EDIT_VOLUME,
  ) {
    super(`Edit volume ${volume} exceeds the limit of ${limit} blocks`);
    this.name = 'EditVolumeError';
  }
}

/** i18n keys used as change set labels. */
export const EDITOR_ACTION = {
  place: 'editor.action.place',
  remove: 'editor.action.remove',
  fill: 'editor.action.fill',
  replace: 'editor.action.replace',
  rotate: 'editor.action.rotate',
  mirror: 'editor.action.mirror',
  paste: 'editor.action.paste',
  delete: 'editor.action.delete',
  cut: 'editor.action.cut',
} as const;

function checkVolume(volume: number): void {
  if (volume > MAX_EDIT_VOLUME) throw new EditVolumeError(volume);
}

/**
 * Box occupied by the content of `box` after rotating it `quarterTurns` × 90°
 * clockwise (seen from above). The box keeps its minimum (north-west, bottom)
 * corner and odd turns swap the X/Z extents, so square boxes rotate in place
 * and four quarter turns always return the content to where it was.
 */
export function rotatedBox(box: Box3, quarterTurns: number): Box3 {
  const b = normalizeBox(box);
  if (((quarterTurns % 2) + 2) % 2 === 0) return b;
  const s = boxSize(b);
  return { min: b.min, max: { x: b.min.x + s.z - 1, y: b.max.y, z: b.min.z + s.x - 1 } };
}

/** Local (lx, lz) of a box of size (sx, sz) after a clockwise rotation. */
function rotateLocal(lx: number, lz: number, sx: number, sz: number, turns: 1 | 2 | 3) {
  switch (turns) {
    case 1:
      return { x: sz - 1 - lz, z: lx };
    case 2:
      return { x: sx - 1 - lx, z: sz - 1 - lz };
    case 3:
      return { x: lz, z: sx - 1 - lx };
  }
}

/** Builds a change set from a map of target states, skipping cells that already match. */
function diff(
  doc: BuildDocument,
  targets: ReadonlyMap<string, { pos: Vec3; state: BlockStateString }>,
  label: string,
): ChangeSet {
  const changes: BlockChange[] = [];
  for (const { pos, state } of targets.values()) {
    const before = doc.getBlock(pos.x, pos.y, pos.z);
    if (before !== state) changes.push({ pos, before, after: state });
  }
  return { changes, origin: 'user', label };
}

/**
 * Moves the content of `box` through a cell mapping and blockstate transform.
 * The source box is cleared first, then the transformed content (incl. air)
 * is written to the target cells.
 */
function transformContent(
  doc: BuildDocument,
  box: Box3,
  mapPos: (p: Vec3) => Vec3,
  mapState: (s: BlockStateString) => BlockStateString,
  label: string,
): ChangeSet {
  const b = normalizeBox(box);
  checkVolume(boxVolume(b));
  const targets = new Map<string, { pos: Vec3; state: BlockStateString }>();
  for (const pos of boxCells(b)) targets.set(vec3Key(pos), { pos, state: AIR });
  const cache = new Map<BlockStateString, BlockStateString>();
  for (const pos of boxCells(b)) {
    const state = doc.getBlock(pos.x, pos.y, pos.z);
    let mapped = cache.get(state);
    if (mapped === undefined) {
      mapped = state === AIR ? AIR : mapState(state);
      cache.set(state, mapped);
    }
    const target = mapPos(pos);
    targets.set(vec3Key(target), { pos: target, state: mapped });
  }
  return diff(doc, targets, label);
}

/** Default {@link SelectionOps}. All ops are pure: they read `doc` and return a change set. */
export const selectionOps: SelectionOps = {
  fill(doc, box, state) {
    checkVolume(boxVolume(box));
    const changes: BlockChange[] = [];
    for (const pos of boxCells(box)) {
      const before = doc.getBlock(pos.x, pos.y, pos.z);
      if (before !== state) changes.push({ pos, before, after: state });
    }
    return { changes, origin: 'user', label: EDITOR_ACTION.fill };
  },

  replace(doc, box, from, to) {
    checkVolume(boxVolume(box));
    const changes: BlockChange[] = [];
    if (from === to) return { changes, origin: 'user', label: EDITOR_ACTION.replace };
    for (const pos of boxCells(box)) {
      if (doc.getBlock(pos.x, pos.y, pos.z) === from)
        changes.push({ pos, before: from, after: to });
    }
    return { changes, origin: 'user', label: EDITOR_ACTION.replace };
  },

  rotate(doc, registry: BlockRegistry, box, quarterTurns) {
    const b = normalizeBox(box);
    const s = boxSize(b);
    const target = rotatedBox(b, quarterTurns);
    return transformContent(
      doc,
      b,
      (p) => {
        const l = rotateLocal(p.x - b.min.x, p.z - b.min.z, s.x, s.z, quarterTurns);
        return { x: target.min.x + l.x, y: p.y, z: target.min.z + l.z };
      },
      (state) => rotateStateY(registry, state, quarterTurns),
      EDITOR_ACTION.rotate,
    );
  },

  mirror(doc, registry, box, axis) {
    const b = normalizeBox(box);
    return transformContent(
      doc,
      b,
      (p) =>
        axis === 'x'
          ? { x: b.min.x + b.max.x - p.x, y: p.y, z: p.z }
          : { x: p.x, y: p.y, z: b.min.z + b.max.z - p.z },
      (state) => mirrorState(registry, state, axis),
      EDITOR_ACTION.mirror,
    );
  },

  copy(doc, box): Clipboard {
    const b = normalizeBox(box);
    checkVolume(boxVolume(b));
    const blocks: { offset: Vec3; state: BlockStateString }[] = [];
    for (const pos of boxCells(b)) {
      const state = doc.getBlock(pos.x, pos.y, pos.z);
      if (state === AIR) continue;
      blocks.push({
        offset: { x: pos.x - b.min.x, y: pos.y - b.min.y, z: pos.z - b.min.z },
        state,
      });
    }
    return { size: boxSize(b), blocks };
  },

  paste(doc, clip, at) {
    checkVolume(clip.size.x * clip.size.y * clip.size.z);
    const targets = new Map<string, { pos: Vec3; state: BlockStateString }>();
    for (const { pos, state } of clipboardPlacement(clip, at))
      targets.set(vec3Key(pos), { pos, state });
    return diff(doc, targets, EDITOR_ACTION.paste);
  },
};

/** Absolute positions of a clipboard's blocks when pasted with its min corner at `at`. */
export function clipboardPlacement(
  clip: Clipboard,
  at: Vec3,
): { pos: Vec3; state: BlockStateString }[] {
  return clip.blocks.map(({ offset, state }) => ({
    pos: { x: at.x + offset.x, y: at.y + offset.y, z: at.z + offset.z },
    state,
  }));
}
