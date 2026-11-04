import { yRotation, type ModelBuilder } from './context';
import { flipY, lockedBox, rotateY, type Quad } from './geometry';

/**
 * Stairs. Built for `facing=east, half=bottom` like the vanilla models (step on the east
 * half), `*_left` shapes are the `*_right` ones turned 270°, and `half=top` mirrors the
 * bottom geometry vertically (left/right stay where they are, as in Java).
 */
export const stairs: ModelBuilder = (ctx) => {
  const tex = ctx.faces;
  const shape = ctx.props['shape'] ?? 'straight';
  const parts: Quad[] = [...lockedBox([0, 0, 0], [16, 8, 16], tex)];
  if (shape.startsWith('outer')) {
    parts.push(...lockedBox([8, 8, 8], [16, 16, 16], tex));
  } else {
    parts.push(...lockedBox([8, 8, 0], [16, 16, 16], tex));
    if (shape.startsWith('inner')) parts.push(...lockedBox([0, 8, 8], [8, 16, 16], tex));
  }
  const left = shape.endsWith('_left') ? 270 : 0;
  const rotated = rotateY(parts, (yRotation('east', ctx.props['facing']) + left) % 360);
  return ctx.props['half'] === 'top' ? flipY(rotated) : rotated;
};
