import type { Direction } from '@laracraft/core-model';
import { yRotation, type ModelBuilder } from './context';
import { box, rotateY, type FaceSpec, type P3 } from './geometry';

/**
 * Chest: 14×14×14 px box with a latch on the front (`facing`). Double chests (`type` left/right)
 * extend to the block edge towards their other half (Java: left → clockwise of `facing`) and share
 * one 2 px latch across the seam.
 *
 * Built for `facing=north` with Minecraft auto-UV: the front uses the registry `north` texture,
 * top/bottom `up`/`down`, back and sides the `side` texture. Double chest halves look up
 * `<texture>_left` / `<texture>_right` for the front, back, top and bottom (15 px wide slices of
 * one drawing, so there is no frame at the seam) and fall back to the single-chest texture.
 */
export const chest: ModelBuilder = (ctx) => {
  const type =
    ctx.props['type'] === 'left' || ctx.props['type'] === 'right' ? ctx.props['type'] : '';
  const half = (name: string) => (type ? ctx.pick(`${name}_${type}`, name) : ctx.pick(name));
  const front = half(ctx.faces.north);
  const side = ctx.pick(ctx.faces.side);
  // The partner half lies east of a left half and west of a right half (before rotation).
  const seam: Direction | null = type === 'left' ? 'east' : type === 'right' ? 'west' : null;
  const x1 = type === 'right' ? 0 : 1;
  const x2 = type === 'left' ? 16 : 15;

  const bodyFaces: Partial<Record<Direction, string>> = {
    north: front,
    south: half(ctx.faces.south),
    up: half(ctx.faces.up),
    down: half(ctx.faces.down),
    west: side,
    east: side,
  };
  if (seam) delete bodyFaces[seam];
  const body = box([x1, 0, 1], [x2, 14, 15], bodyFaces);

  // Latch (y 7..11, 1 px deep): its front comes from the latch drawn on the front texture via
  // auto-UV; the other faces sample the latch's columns / top / bottom row of that texture.
  const [lx1, lx2]: readonly [number, number] =
    type === 'left' ? [15, 16] : type === 'right' ? [0, 1] : [7, 9];
  const u1 = 16 - lx2;
  const u2 = 16 - lx1;
  const latchFaces: Partial<Record<Direction, FaceSpec>> = {
    north: { tex: front },
    up: { tex: front, uv: [u1, 5, u2, 6] },
    down: { tex: front, uv: [u1, 8, u2, 9] },
    west: { tex: front, uv: [u2 - 1, 5, u2, 9] },
    east: { tex: front, uv: [u1, 5, u1 + 1, 9] },
  };
  if (seam) delete latchFaces[seam];
  const from: P3 = [lx1, 7, 0];
  const to: P3 = [lx2, 11, 1];
  const latch = box(from, to, latchFaces);

  return rotateY([...body, ...latch], yRotation('north', ctx.props['facing']));
};
