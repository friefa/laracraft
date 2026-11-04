import {
  BlockPalette,
  ChunkedVolume,
  collectTextureNames,
  createJavaBlockRegistry,
  type BlockStateString,
} from '@laracraft/core-model';
import { extractChunkInput } from './extract';
import { meshChunk } from './greedy-mesher';
import { resolvePaletteRenderInfo } from './render-info';
import { createTextureLayers } from './texture-layers';
import type { ChunkMeshOutput } from './types';

/**
 * Mesh-build benchmark (Node). Prints timings; the bound is deliberately generous so
 * the test is stable on CI. Real budgets are measured on devices in P1.9.
 */
const registry = createJavaBlockRegistry();
const textures = createTextureLayers({
  textures: Object.fromEntries(
    [...collectTextureNames(registry), 'missing'].map((n) => [n, {}] as const),
  ),
});

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const quadCount = (o: ChunkMeshOutput): number =>
  (o.opaque.indices.length + o.cutout.indices.length + o.translucent.indices.length) / 6;

/** A village: grass ground, houses (walls, logs, windows, stair roofs, interior) and trees. */
function buildVillage(): { volume: ChunkedVolume; palette: BlockPalette } {
  const palette = new BlockPalette();
  const volume = new ChunkedVolume();
  const id = (s: string) => palette.intern(s as BlockStateString);
  const rnd = makeRng(1234);
  const size = 160; // 10 × 10 chunks, 2 chunks high
  const grass = id('grass_block[snowy=false]');
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) volume.set(x, 1, z, grass);
  const walls = ['cobblestone', 'stone_bricks', 'oak_planks', 'bricks', 'white_terracotta'];
  const log = id('oak_log[axis=y]');
  const glass = id('glass');
  const floor = id('spruce_planks');
  const torch = id('torch');
  const table = id('crafting_table');
  const furnace = id('furnace[facing=south,lit=false]');
  const stairs = (f: string) =>
    id(`oak_stairs[facing=${f},half=bottom,shape=straight,waterlogged=false]`);
  const slab = id('oak_slab[type=bottom,waterlogged=false]');
  const leaves = id('oak_leaves[distance=1,persistent=true,waterlogged=false]');

  for (let hx = 2; hx + 11 < size; hx += 16) {
    for (let hz = 2; hz + 11 < size; hz += 16) {
      if (rnd() < 0.25) {
        // Tree.
        const tx = hx + 5;
        const tz = hz + 5;
        for (let y = 2; y < 8; y++) volume.set(tx, y, tz, log);
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (let y = 6; y < 10; y++)
              if ((dx || dz || y > 7) && Math.abs(dx) + Math.abs(dz) + (y - 6) < 5)
                volume.set(tx + dx, y, tz + dz, leaves);
        continue;
      }
      const w = 9 + Math.floor(rnd() * 3);
      const d = 9 + Math.floor(rnd() * 3);
      const h = 4 + Math.floor(rnd() * 3);
      const wall = id(walls[Math.floor(rnd() * walls.length)] ?? 'cobblestone');
      for (let x = 0; x < w; x++)
        for (let z = 0; z < d; z++) {
          volume.set(hx + x, 1, hz + z, floor);
          const edgeX = x === 0 || x === w - 1;
          const edgeZ = z === 0 || z === d - 1;
          if (!edgeX && !edgeZ) continue;
          for (let y = 2; y < 2 + h; y++) {
            const corner = edgeX && edgeZ;
            const window = !corner && y >= 3 && y <= 4 && (x + z) % 3 === 1;
            const door = z === 0 && x === Math.floor(w / 2) && y <= 3;
            if (door) continue;
            volume.set(hx + x, y, hz + z, corner ? log : window ? glass : wall);
          }
        }
      // Stair roof.
      for (let layer = 0; layer * 2 < Math.min(w, d); layer++) {
        const y = 3 + h + layer;
        for (let x = layer - 1; x <= w - layer; x++) {
          volume.set(hx + x, y, hz + layer - 1, stairs('south'));
          volume.set(hx + x, y, hz + d - layer, stairs('north'));
        }
        for (let z = layer; z < d - layer; z++) {
          volume.set(hx + layer - 1, y, hz + z, stairs('east'));
          volume.set(hx + w - layer, y, hz + z, stairs('west'));
        }
      }
      volume.set(hx + Math.floor(w / 2), 4 + h + Math.floor(Math.min(w, d) / 2), hz + 4, slab);
      volume.set(hx + 1, 2, hz + 1, table);
      volume.set(hx + 2, 2, hz + 1, furnace);
      volume.set(hx + 1, 4, hz + d - 2, torch);
      volume.set(hx + w - 2, 4, hz + d - 2, torch);
    }
  }
  return { volume, palette };
}

describe('mesher benchmark', () => {
  it('meshes a full mixed 16³ chunk and a 200-chunk village quickly', () => {
    // 1. Worst case: a completely filled chunk of random mixed blocks.
    const mixedStates = [
      'stone',
      'cobblestone',
      'oak_planks',
      'glass',
      'oak_leaves[distance=1,persistent=true,waterlogged=false]',
      'ice',
      'torch',
      'furnace[facing=west,lit=false]',
      'oak_log[axis=x]',
      'grass_block[snowy=false]',
    ];
    const mixedPalette = new BlockPalette();
    const mixed = new ChunkedVolume();
    const rnd = makeRng(99);
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++)
          mixed.set(
            x,
            y,
            z,
            mixedPalette.intern(
              mixedStates[Math.floor(rnd() * mixedStates.length)] as BlockStateString,
            ),
          );
    const mixedInfo = resolvePaletteRenderInfo(registry, mixedPalette.entries());
    const mixedInput = extractChunkInput(mixed, { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 5; i++) meshChunk(mixedInput, mixedInfo, textures); // warm-up
    const t0 = performance.now();
    const runs = 20;
    let mixedQuads = 0;
    for (let i = 0; i < runs; i++)
      mixedQuads = quadCount(meshChunk(mixedInput, mixedInfo, textures));
    const mixedMs = (performance.now() - t0) / runs;

    // 2. Realistic distribution: ~50k blocks over 200 chunks.
    const { volume, palette } = buildVillage();
    const info = resolvePaletteRenderInfo(registry, palette.entries());
    const coords = [];
    for (let cy = 0; cy < 2; cy++)
      for (let cz = 0; cz < 10; cz++)
        for (let cx = 0; cx < 10; cx++) coords.push({ x: cx, y: cy, z: cz });
    expect(coords).toHaveLength(200);

    const t1 = performance.now();
    let extractMs = 0;
    let quads = 0;
    let instances = 0;
    for (const c of coords) {
      const e0 = performance.now();
      const input = extractChunkInput(volume, c);
      extractMs += performance.now() - e0;
      const out = meshChunk(input, info, textures);
      quads += quadCount(out);
      for (const m of out.models) instances += m.positions.length / 3;
    }
    const villageMs = performance.now() - t1;

    console.log(
      `[mesher bench] mixed 16³ chunk: ${mixedMs.toFixed(2)} ms/chunk, ${mixedQuads} quads\n` +
        `[mesher bench] village: ${volume.blockCount} blocks in ${coords.length} chunks: ` +
        `${villageMs.toFixed(1)} ms total (extract ${extractMs.toFixed(1)} ms), ` +
        `${(villageMs / coords.length).toFixed(2)} ms/chunk, ${quads} quads, ${instances} model instances`,
    );
    expect(volume.blockCount).toBeGreaterThan(45_000);
    expect(volume.blockCount).toBeLessThan(65_000);
    expect(mixedMs * runs + villageMs).toBeLessThan(2000);
  });
});
