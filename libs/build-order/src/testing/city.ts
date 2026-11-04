import {
  BuildDocument,
  resolveBlockState,
  type BlockRegistry,
  type BlockStateString,
} from '@laracraft/core-model';

const META = {
  name: 'bench',
  dataVersion: 4189,
  edition: 'java' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/**
 * A grid of towers with hollow walls, floors every 4 levels, stair roofs,
 * wall torches, sand caps, redstone lines and water — about 50 000 blocks.
 */
export function generateCity(registry: BlockRegistry, target = 50_000): BuildDocument {
  const doc = new BuildDocument({ ...META });
  const cache = new Map<string, BlockStateString>();
  const state = (s: string): BlockStateString => {
    let r = cache.get(s);
    if (!r) {
      const res = resolveBlockState(registry, s);
      if (!res.ok) throw new Error(res.error);
      r = res.state;
      cache.set(s, r);
    }
    return r;
  };
  let count = 0;
  const set = (x: number, y: number, z: number, s: string) => {
    if (doc.setBlock({ x, y, z }, state(s))) count++;
  };
  const size = 9;
  const height = 24;
  const facings = ['north', 'east', 'south', 'west'] as const;
  for (let t = 0; count < target; t++) {
    const ox = (t % 12) * (size + 3);
    const oz = Math.floor(t / 12) * (size + 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          const edge = x === 0 || z === 0 || x === size - 1 || z === size - 1;
          if (y % 4 === 0 || edge) {
            set(ox + x, y, oz + z, (x + y + z) % 7 === 0 ? 'stone_bricks' : 'cobblestone');
          } else if (x === 1 && z === 4 && y % 4 === 1) {
            set(ox + x, y, oz + z, 'wall_torch[facing=east]');
          } else if (x === 4 && z === 4 && y % 4 === 1) {
            set(ox + x, y, oz + z, 'sand');
          } else if (z === 2 && y % 4 === 1 && x > 1 && x < size - 2) {
            set(ox + x, y, oz + z, x === 3 ? 'repeater[delay=2,facing=west]' : 'redstone_wire');
          } else if (x === 6 && z === 6 && y % 4 === 1) {
            set(ox + x, y, oz + z, 'water[level=0]');
          }
        }
      }
    }
    // Stair roof ring.
    for (let i = 0; i < size; i++) {
      set(ox + i, height, oz - 1 + 0, `oak_stairs[facing=${facings[2]}]`);
      set(ox + i, height, oz + size, `oak_stairs[facing=${facings[0]}]`);
    }
  }
  return doc;
}
