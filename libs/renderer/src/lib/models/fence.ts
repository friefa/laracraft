import { HORIZONTAL_DIRECTIONS } from '@laracraft/core-model';
import { yRotation, type ModelBuilder } from './context';
import { lockedBox, rotateY, translate, type P3, type Quad } from './geometry';

/** Adds `arm` (built for north) once per horizontal side whose property passes `connected`. */
export function connectedArms(
  props: Readonly<Record<string, string>>,
  connected: (value: string | undefined) => boolean,
  arm: (value: string) => Quad[],
): Quad[] {
  const out: Quad[] = [];
  for (const dir of HORIZONTAL_DIRECTIONS) {
    const value = props[dir];
    if (connected(value)) out.push(...rotateY(arm(value ?? ''), yRotation('north', dir)));
  }
  return out;
}

/** Fence: centre post plus two bars per connected side. */
export const fence: ModelBuilder = (ctx) => {
  const tex = ctx.faces;
  return [
    ...lockedBox([6, 0, 6], [10, 16, 10], tex),
    ...connectedArms(
      ctx.props,
      (v) => v === 'true',
      () => [
        ...lockedBox([7, 12, 0], [9, 15, 6], tex, ['south']),
        ...lockedBox([7, 6, 0], [9, 9, 6], tex, ['south']),
      ],
    ),
  ];
};

const GATE_POSTS: readonly (readonly [P3, P3])[] = [
  [
    [0, 5, 7],
    [2, 16, 9],
  ],
  [
    [14, 5, 7],
    [16, 16, 9],
  ],
];

const GATE_CLOSED: readonly (readonly [P3, P3])[] = [
  [
    [6, 6, 7],
    [8, 15, 9],
  ],
  [
    [8, 6, 7],
    [10, 15, 9],
  ],
  [
    [2, 6, 7],
    [6, 9, 9],
  ],
  [
    [2, 12, 7],
    [6, 15, 9],
  ],
  [
    [10, 6, 7],
    [14, 9, 9],
  ],
  [
    [10, 12, 7],
    [14, 15, 9],
  ],
];

const GATE_OPEN: readonly (readonly [P3, P3])[] = [
  [
    [0, 6, 13],
    [2, 15, 15],
  ],
  [
    [14, 6, 13],
    [16, 15, 15],
  ],
  [
    [0, 6, 9],
    [2, 9, 13],
  ],
  [
    [0, 12, 9],
    [2, 15, 13],
  ],
  [
    [14, 6, 9],
    [16, 9, 13],
  ],
  [
    [14, 12, 9],
    [16, 15, 13],
  ],
];

/**
 * Fence gate, built for `facing=south` (gate spans along X). Open gates swing their
 * wings towards `facing`; `in_wall` lowers the gate by 3 pixels.
 */
export const fenceGate: ModelBuilder = (ctx) => {
  const tex = ctx.faces;
  const wings = ctx.props['open'] === 'true' ? GATE_OPEN : GATE_CLOSED;
  let quads: Quad[] = [...GATE_POSTS, ...wings].flatMap(([a, b]) => lockedBox(a, b, tex));
  if (ctx.props['in_wall'] === 'true') quads = translate(quads, [0, -3, 0]);
  return rotateY(quads, yRotation('south', ctx.props['facing']));
};
