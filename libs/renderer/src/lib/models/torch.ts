import { yRotation, type ModelBuilder, type ModelContext } from './context';
import { box, doubleSided, rotateY, rotateZ, translate, type P3, type Quad } from './geometry';

/** Texture of a (redstone) torch; unlit redstone torches use `*_off` when available. */
function torchTexture(ctx: ModelContext): string {
  const base = ctx.faces.up;
  return ctx.props['lit'] === 'false' ? ctx.pick(`${base}_off`, base) : base;
}

/** 2×2 px torch stick from `from`, `height` px tall, textured with the torch's stick pixels. */
export function torchStick(tex: string, from: P3, height = 10): Quad[] {
  const [x, y, z] = from;
  const side = { tex, uv: [7, 6, 9, 6 + height] as const };
  return box([x, y, z], [x + 2, y + height, z + 2], {
    up: { tex, uv: [7, 6, 9, 8] },
    down: { tex, uv: [7, 14, 9, 16] },
    north: side,
    south: side,
    west: side,
    east: side,
  });
}

/** Standing torch / redstone torch. */
export const torch: ModelBuilder = (ctx) => torchStick(torchTexture(ctx), [7, 0, 7]);

/**
 * Wall torch, built for `facing=east` (attached to the block west of it) and tilted 22.5°
 * away from the wall. Vanilla starts the stick 1 px inside the wall; here it starts at the
 * block edge so the model stays inside the block.
 */
export const wallTorch: ModelBuilder = (ctx) => {
  const stick = rotateZ(torchStick(torchTexture(ctx), [0, 3.5, 7]), 22.5, [0, 3.5, 8]);
  return rotateY(stick, yRotation('east', ctx.props['facing']));
};

/** Lantern standing on the floor or hanging from the ceiling (`hanging=true`). */
export const lantern: ModelBuilder = (ctx) => {
  const tex = ctx.faces.up;
  const hanging = ctx.props['hanging'] === 'true';
  const bodySide = { tex, uv: [0, 2, 6, 9] as const };
  const capSide = { tex, uv: [1, 0, 5, 2] as const };
  const body = box([5, 0, 5], [11, 7, 11], {
    up: { tex, uv: [0, 9, 6, 15] },
    down: { tex, uv: [0, 9, 6, 15] },
    north: bodySide,
    south: bodySide,
    west: bodySide,
    east: bodySide,
  });
  const cap = box([6, 7, 6], [10, 9, 10], {
    up: { tex, uv: [1, 10, 5, 14] },
    north: capSide,
    south: capSide,
    west: capSide,
    east: capSide,
  });
  // Handle (standing) or chain (hanging): two crossed planes, rotated 45°.
  const lift = hanging ? 1 : 0;
  const top = hanging ? 16 : 11;
  const handleUv = [11, 1, 14, 1 + Math.min(6, top - 9 - lift)] as const;
  const plane = doubleSided(
    box([6.5, 9 + lift, 8], [9.5, top, 8], { south: { tex, uv: handleUv } }),
  );
  return [
    ...translate([...body, ...cap], [0, lift, 0]),
    ...rotateY(plane, 45),
    ...rotateY(plane, 135),
  ];
};
