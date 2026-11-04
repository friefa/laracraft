import type { BlockStateString, Vec3 } from '@laracraft/core-model';
import type { BuildPlan, PlaceAction, RemoveAction } from '@laracraft/build-order';
import { describeStandPosition, temporaryBlockAt } from './stand-position';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const DIRT = 'minecraft:dirt' as BlockStateString;

const place = (pos: Vec3, standAt: Vec3, extra: Partial<PlaceAction> = {}): PlaceAction => ({
  kind: 'place',
  pos,
  state: DIRT,
  item: 'minecraft:dirt',
  standAt,
  look: { horizontal: 'north', vertical: 'down' },
  clickOn: { pos: v(pos.x, pos.y - 1, pos.z), face: 'up' },
  ...extra,
});

const remove = (pos: Vec3, standAt?: Vec3): RemoveAction => ({
  kind: 'remove',
  pos,
  state: DIRT,
  reason: 'scaffold',
  ...(standAt ? { standAt } : {}),
});

describe('describeStandPosition', () => {
  const at = (standAt: Vec3, pos = v(5, 3, 5)) => describeStandPosition(place(pos, standAt));

  it('uses Java compass directions (north = -Z, east = +X)', () => {
    expect(at(v(5, 3, 4))).toMatchObject({
      relation: 'adjacent',
      northSouth: { direction: 'north', distance: 1 },
    });
    expect(at(v(5, 3, 6))?.northSouth).toEqual({ direction: 'south', distance: 1 });
    expect(at(v(6, 3, 5))?.eastWest).toEqual({ direction: 'east', distance: 1 });
    expect(at(v(4, 3, 5))?.eastWest).toEqual({ direction: 'west', distance: 1 });
    expect(at(v(4, 3, 5))?.northSouth).toBeUndefined();
  });

  it('returns the raw offset and the height difference', () => {
    expect(at(v(4, 3, 7))).toEqual({
      dx: -1,
      dy: 0,
      dz: 2,
      relation: 'offset',
      northSouth: { direction: 'south', distance: 2 },
      eastWest: { direction: 'west', distance: 1 },
      pillar: false,
      onTemporary: false,
    });
    expect(at(v(5, 4, 4))).toMatchObject({ dy: 1, relation: 'adjacent' });
    expect(at(v(5, 1, 6))).toMatchObject({ dy: -2, relation: 'adjacent' });
  });

  it('classifies diagonal and far positions', () => {
    expect(at(v(6, 3, 6))).toMatchObject({
      relation: 'diagonal',
      northSouth: { direction: 'south', distance: 1 },
      eastWest: { direction: 'east', distance: 1 },
    });
    expect(at(v(5, 3, 2))).toMatchObject({
      relation: 'offset',
      northSouth: { direction: 'north', distance: 3 },
    });
    expect(at(v(7, 3, 4))?.relation).toBe('offset');
  });

  it('detects pillaring and same-column positions', () => {
    expect(describeStandPosition(place(v(0, 4, 0), v(0, 4, 0), { jump: true }))).toMatchObject({
      relation: 'same',
      pillar: true,
    });
    expect(at(v(5, 5, 5))).toMatchObject({ relation: 'same', dy: 2, pillar: false });
    expect(describeStandPosition(remove(v(0, 2, 0), v(0, 3, 0)))).toMatchObject({
      relation: 'same',
      dy: 1,
      pillar: false,
    });
  });

  it('passes the scaffold flag through and handles removals without stand position', () => {
    expect(
      describeStandPosition(place(v(0, 0, 0), v(1, 1, 0)), { onTemporary: true }),
    ).toMatchObject({ onTemporary: true });
    expect(describeStandPosition(remove(v(0, 0, 0)))).toBeNull();
    expect(describeStandPosition(remove(v(0, 0, 0), v(0, 0, 2)))).toMatchObject({
      dz: 2,
      relation: 'offset',
    });
  });
});

describe('temporaryBlockAt', () => {
  const step = (index: number, actions: (PlaceAction | RemoveAction)[]) => ({
    index,
    phase: 'structure' as const,
    actions,
    materials: [],
    hints: [],
    yRange: [0, 0] as const,
  });
  const plan: BuildPlan = {
    steps: [
      step(0, [
        place(v(0, 0, 0), v(0, 0, 0), { jump: true, temporary: true }),
        place(v(0, 1, 0), v(0, 1, 0), { jump: true, temporary: true }),
        place(v(1, 0, 0), v(1, 0, 2)),
      ]),
      step(1, [place(v(1, 2, 0), v(0, 2, 0)), remove(v(0, 1, 0)), remove(v(0, 0, 0))]),
    ],
    totalMaterials: [],
    temporaryMaterials: [],
    warnings: [],
    stats: { blocks: 2, placements: 4, removals: 2, millis: 0 },
  };

  it('tracks temporary blocks until they are removed', () => {
    expect(temporaryBlockAt(plan, 0, 0, v(0, 0, 0))).toBe(false);
    expect(temporaryBlockAt(plan, 0, 1, v(0, 0, 0))).toBe(true);
    expect(temporaryBlockAt(plan, 1, 0, v(0, 1, 0))).toBe(true);
    expect(temporaryBlockAt(plan, 1, 2, v(0, 1, 0))).toBe(false);
    expect(temporaryBlockAt(plan, 1, 2, v(0, 0, 0))).toBe(true);
    expect(temporaryBlockAt(plan, 1, 3, v(0, 0, 0))).toBe(false);
  });

  it('ignores permanent blocks and empty cells', () => {
    expect(temporaryBlockAt(plan, 1, 0, v(1, 0, 0))).toBe(false);
    expect(temporaryBlockAt(plan, 1, 0, v(9, 9, 9))).toBe(false);
  });
});
