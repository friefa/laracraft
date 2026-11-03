import type { BlockStateString } from '../blockstate/blockstate';
import { BuildDocument, invertChangeSet, type BuildMetadata } from './build-document';

export const META: BuildMetadata = {
  name: 'test',
  dataVersion: 4189,
  edition: 'java',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const STONE = 'minecraft:stone' as BlockStateString;
const DIRT = 'minecraft:dirt' as BlockStateString;
const AIR = 'minecraft:air' as BlockStateString;

describe('BuildDocument', () => {
  it('sets/gets blocks incl. negative coordinates and tracks bounds', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: -1, y: 0, z: -17 }, STONE);
    doc.setBlock({ x: 20, y: 5, z: 3 }, DIRT);
    expect(doc.getBlock(-1, 0, -17)).toBe(STONE);
    expect(doc.getBlock(20, 5, 3)).toBe(DIRT);
    expect(doc.getBlock(0, 0, 0)).toBe(AIR);
    expect(doc.volume.blockCount).toBe(2);
    expect(doc.volume.bounds()).toEqual({
      min: { x: -1, y: 0, z: -17 },
      max: { x: 20, y: 5, z: 3 },
    });
  });

  it('releases empty chunks', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 1, y: 1, z: 1 }, STONE);
    doc.setBlock({ x: 1, y: 1, z: 1 }, AIR);
    expect(doc.volume.chunkList()).toHaveLength(0);
    expect(doc.volume.bounds()).toBeUndefined();
  });

  it('apply + invert restores the original state (overlapping edits)', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 0, y: 0, z: 0 }, DIRT);
    const applied = doc.apply({
      origin: 'user',
      changes: [
        { pos: { x: 0, y: 0, z: 0 }, before: DIRT, after: STONE },
        { pos: { x: 0, y: 0, z: 0 }, before: STONE, after: AIR },
        { pos: { x: 1, y: 0, z: 0 }, before: AIR, after: STONE },
        { pos: { x: 2, y: 0, z: 0 }, before: AIR, after: AIR },
      ],
    });
    expect(applied.changes).toHaveLength(3);
    doc.apply(invertChangeSet(applied));
    expect(doc.getBlock(0, 0, 0)).toBe(DIRT);
    expect(doc.getBlock(1, 0, 0)).toBe(AIR);
  });

  it('marks neighbour chunks dirty for border edits', () => {
    const doc = new BuildDocument(META);
    doc.volume.takeDirtyChunks();
    doc.setBlock({ x: 15, y: 3, z: 3 }, STONE);
    expect(doc.volume.takeDirtyChunks().sort()).toEqual(['0,0,0', '1,0,0']);
  });
});
