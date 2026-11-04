import { chunkBounds, lowestBlockY, pickVoxel } from './picking';

const solidSet = (cells: [number, number, number][]) => {
  const set = new Set(cells.map((c) => c.join(',')));
  return (x: number, y: number, z: number) => set.has(`${x},${y},${z}`);
};

describe('pickVoxel', () => {
  const block = solidSet([[0, 0, 0]]);

  it.each([
    ['east', { x: 5.5, y: 0.25, z: 0.5 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0.25, z: 0.5 }],
    ['west', { x: -5, y: 0.5, z: 0.75 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0.5, z: 0.75 }],
    ['up', { x: 0.5, y: 9, z: 0.5 }, { x: 0, y: -1, z: 0 }, { x: 0.5, y: 1, z: 0.5 }],
    ['down', { x: 0.2, y: -3, z: 0.8 }, { x: 0, y: 1, z: 0 }, { x: 0.2, y: 0, z: 0.8 }],
    ['south', { x: 0.5, y: 0.9, z: 4 }, { x: 0, y: 0, z: -1 }, { x: 0.5, y: 0.9, z: 1 }],
    ['north', { x: 0.5, y: 0.1, z: -4 }, { x: 0, y: 0, z: 1 }, { x: 0.5, y: 0.1, z: 0 }],
  ] as const)('hits the %s face with the hit point', (face, origin, direction, hit) => {
    const pick = pickVoxel({ origin, direction }, block);
    expect(pick?.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(pick?.face).toBe(face);
    expect(pick?.hit?.x).toBeCloseTo(hit.x);
    expect(pick?.hit?.y).toBeCloseTo(hit.y);
    expect(pick?.hit?.z).toBeCloseTo(hit.z);
  });

  it('returns the first block along a diagonal ray', () => {
    const isSolid = solidSet([
      [3, 3, 3],
      [5, 5, 5],
    ]);
    const pick = pickVoxel(
      { origin: { x: 10.3, y: 10.6, z: 10.45 }, direction: { x: -1, y: -1.1, z: -0.95 } },
      isSolid,
    );
    expect(pick?.pos).toEqual({ x: 5, y: 5, z: 5 });
    expect(['up', 'east', 'south']).toContain(pick?.face);
  });

  it('works with negative coordinates', () => {
    const pick = pickVoxel(
      { origin: { x: -9.5, y: 0.5, z: -3.5 }, direction: { x: 1, y: 0, z: 0 } },
      solidSet([[-4, 0, -4]]),
    );
    expect(pick?.pos).toEqual({ x: -4, y: 0, z: -4 });
    expect(pick?.face).toBe('west');
  });

  it('respects the maximum distance', () => {
    const far = solidSet([[0, 0, -300]]);
    const ray = { origin: { x: 0.5, y: 0.5, z: 0.5 }, direction: { x: 0, y: 0, z: -1 } };
    expect(pickVoxel(ray, far)).toBeNull();
    expect(pickVoxel(ray, far, { maxDistance: 400 })?.pos).toEqual({ x: 0, y: 0, z: -300 });
  });

  it('clips to the build bounds so far cameras reach the build', () => {
    const isSolid = solidSet([[0, 0, 0]]);
    const ray = { origin: { x: 0.5, y: 0.5, z: 1000 }, direction: { x: 0, y: 0, z: -1 } };
    expect(pickVoxel(ray, isSolid)).toBeNull();
    const pick = pickVoxel(ray, isSolid, {
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 15, z: 15 } },
    });
    expect(pick?.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(pick?.face).toBe('south');
  });

  it('reports the entry face when the first cell inside the bounds is solid', () => {
    const pick = pickVoxel(
      { origin: { x: 0.5, y: 50, z: 0.5 }, direction: { x: 0, y: -1, z: 0 } },
      solidSet([[0, 3, 0]]),
      { bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 3, z: 0 } } },
    );
    expect(pick).toEqual({ pos: { x: 0, y: 3, z: 0 }, face: 'up', hit: { x: 0.5, y: 1, z: 0.5 } });
  });

  it('ignores blocks above the layer limit', () => {
    const tower = solidSet([
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ]);
    const ray = { origin: { x: 0.5, y: 10, z: 0.5 }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickVoxel(ray, tower)?.pos.y).toBe(2);
    const limited = pickVoxel(ray, tower, { maxY: 0 });
    expect(limited?.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(limited?.face).toBe('up');
    // Also with bounds clipping (bounds top is lowered to the limit).
    const clipped = pickVoxel(ray, tower, {
      maxY: 1,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 2, z: 0 } },
    });
    expect(clipped?.pos.y).toBe(1);
  });

  it('falls back to the ground plane with the cell below and face up', () => {
    const pick = pickVoxel(
      { origin: { x: 2.25, y: 10, z: -3.5 }, direction: { x: 1, y: -2, z: 0 } },
      () => false,
      { groundY: 0 },
    );
    expect(pick?.pos).toEqual({ x: 7, y: -1, z: -4 });
    expect(pick?.face).toBe('up');
    expect(pick?.hit?.x).toBeCloseTo(0.25);
    expect(pick?.hit?.y).toBe(1);
    expect(pick?.hit?.z).toBeCloseTo(0.5);
  });

  it('uses the ground at the build minimum and only from above', () => {
    const ray = { origin: { x: 0.5, y: 10, z: 0.5 }, direction: { x: 0, y: -1, z: 0 } };
    expect(pickVoxel(ray, () => false, { groundY: 4 })?.pos).toEqual({ x: 0, y: 3, z: 0 });
    const up = { origin: { x: 0.5, y: -5, z: 0.5 }, direction: { x: 0, y: 1, z: 0 } };
    expect(pickVoxel(up, () => false, { groundY: 0 })).toBeNull();
    expect(pickVoxel(ray, () => false)).toBeNull();
  });

  it('prefers blocks over the ground', () => {
    const pick = pickVoxel(
      { origin: { x: 0.5, y: 10, z: 0.5 }, direction: { x: 0, y: -1, z: 0 } },
      solidSet([[0, 0, 0]]),
      { groundY: 0 },
    );
    expect(pick?.pos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('rejects a zero direction', () => {
    expect(
      pickVoxel({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } }, () => true),
    ).toBeNull();
  });
});

describe('chunkBounds / lowestBlockY', () => {
  it('computes coarse bounds from chunk coordinates', () => {
    expect(chunkBounds([])).toBeNull();
    expect(
      chunkBounds([
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 2, z: 1 },
      ]),
    ).toEqual({ min: { x: -16, y: 0, z: 0 }, max: { x: 15, y: 47, z: 31 } });
  });

  it('finds the lowest occupied row', () => {
    const data = new Uint16Array(4096);
    data[5 * 256 + 17] = 3; // local y = 5
    const other = new Uint16Array(4096);
    other[0] = 1; // local y = 0 but one chunk layer higher
    const volume = {
      chunkList: () => [
        { coord: { x: 0, y: -1, z: 0 }, data, count: 1 },
        { coord: { x: 1, y: 0, z: 0 }, data: other, count: 1 },
      ],
    };
    expect(lowestBlockY(volume)).toBe(-11);
    expect(lowestBlockY({ chunkList: () => [] })).toBeNull();
  });
});
