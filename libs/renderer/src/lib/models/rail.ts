import { yRotation, type ModelBuilder } from './context';
import { box, doubleSided, rotateY, type Quad } from './geometry';

const RAIL_Y = 1;

/** Flat rail quad for `north_south` (texture rails run top to bottom = north to south). */
function flatRail(tex: string): Quad[] {
  return doubleSided(box([0, RAIL_Y, 0], [16, RAIL_Y, 16], { up: { tex, uv: [0, 0, 16, 16] } }));
}

/** Ascending towards north: from y=1 at the south edge up to the top of the block. */
function ascendingNorth(tex: string): Quad[] {
  const dy = 16 - RAIL_Y;
  const len = Math.hypot(16, dy);
  const quad: Quad = {
    // BL, BR at the south edge (low), TR, TL at the north edge (high).
    p: [0, RAIL_Y, 16, 16, RAIL_Y, 16, 16, 16, 0, 0, 16, 0],
    uv: [0, 16, 16, 16, 16, 0, 0, 0],
    n: [0, 16 / len, dy / len],
    tex,
    uvLock: false,
    tint: [1, 1, 1],
  };
  return doubleSided([quad]);
}

/**
 * Curve without a dedicated corner texture (`south_east`): half a straight rail from the
 * centre to the south edge plus half a rail from the centre to the east edge, slightly
 * raised so the overlapping quarter does not z-fight.
 */
function compositeCorner(tex: string): Quad[] {
  const south = box([0, RAIL_Y, 8], [16, RAIL_Y, 16], { up: { tex, uv: [0, 8, 16, 16] } });
  const y = RAIL_Y + 0.05;
  const east = box([8, y, 0], [16, y, 16], { up: { tex, uv: [0, 8, 16, 16], rotation: 270 } });
  return doubleSided([...south, ...east]);
}

const CORNER_ROT: Readonly<Record<string, number>> = {
  south_east: 0,
  south_west: 90,
  north_west: 180,
  north_east: 270,
};

/**
 * Rails (normal, powered, detector, activator): all straight, ascending and curved shapes.
 * Powered variants use `*_on` textures when available; curves use `rail_corner` when available.
 */
export const rail: ModelBuilder = (ctx) => {
  const base = ctx.faces.up;
  const tex = ctx.props['powered'] === 'true' ? ctx.pick(`${base}_on`, base) : base;
  const shape = ctx.props['shape'] ?? 'north_south';
  if (shape === 'east_west') return rotateY(flatRail(tex), 90);
  if (shape.startsWith('ascending_')) {
    return rotateY(ascendingNorth(tex), yRotation('north', shape.slice('ascending_'.length)));
  }
  const corner = CORNER_ROT[shape];
  if (corner !== undefined) {
    const cornerTex = `${base}_corner`;
    const quads = ctx.has(cornerTex) ? flatRail(cornerTex) : compositeCorner(tex);
    return rotateY(quads, corner);
  }
  return flatRail(tex);
};
