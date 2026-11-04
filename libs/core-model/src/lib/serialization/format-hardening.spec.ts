import { deflateSync } from 'fflate';
import type { BlockStateString } from '../blockstate/blockstate';
import { BuildDocument } from '../document/build-document';
import { WORLD_LIMIT } from '../document/chunked-volume';
import { META } from '../../testing/fixtures';
import { decodeBase64, encodeBase64 } from './base64';
import { BuildFormatError, deserializeBuild, serializeBuild } from './format';
import { decodeVarints, encodeVarints } from './varint';

// Regression tests for the independent review of P0.2 (see docs/ROADMAP.md, P0.2r).
const s = (v: string) => v as BlockStateString;

function fileWith(overrides: Record<string, unknown>): Record<string, unknown> {
  const doc = new BuildDocument(META);
  doc.setBlock({ x: 0, y: 0, z: 0 }, s('minecraft:stone'));
  return { ...(serializeBuild(doc) as unknown as Record<string, unknown>), ...overrides };
}

const blocks = (bytes: Uint8Array) => ({
  encoding: 'varint-deflate-base64',
  data: encodeBase64(deflateSync(bytes)),
});

describe('format hardening', () => {
  it('rejects decompression bombs before inflating them fully', () => {
    const bomb = blocks(new Uint8Array(20 * 1024 * 1024)); // 20 MB of zeros for a 1-block build
    const t = performance.now();
    expect(() => deserializeBuild(fileWith({ blocks: bomb }))).toThrow(/larger than declared/);
    expect(performance.now() - t).toBeLessThan(5000); // generous: CI and parallel runs are slow
  });

  it('saves and reloads non-canonical spellings of the same state', () => {
    const doc = new BuildDocument(META);
    doc.setBlock({ x: 0, y: 0, z: 0 }, s('stone'));
    doc.setBlock({ x: 1, y: 0, z: 0 }, s('minecraft:stone'));
    doc.setBlock({ x: 2, y: 0, z: 0 }, s('oak_stairs[half=top,facing=east]'));
    const back = deserializeBuild(serializeBuild(doc) as unknown as Record<string, unknown>);
    expect(back.getBlock(0, 0, 0)).toBe('minecraft:stone');
    expect(back.getBlock(1, 0, 0)).toBe('minecraft:stone');
    expect(back.getBlock(2, 0, 0)).toBe('minecraft:oak_stairs[facing=east,half=top]');
    expect(back.palette.size).toBe(3);
  });

  it('rejects origins outside the world range', () => {
    expect(() => deserializeBuild(fileWith({ origin: [2 ** 40, 0, 0] }))).toThrow(BuildFormatError);
    expect(() =>
      deserializeBuild(fileWith({ origin: [WORLD_LIMIT - 1, 0, 0], size: [2, 1, 1] })),
    ).toThrow(BuildFormatError);
    expect(() => deserializeBuild(fileWith({ origin: [1.5, 0, 0] }))).toThrow(BuildFormatError);
  });

  it('rejects non-integer and out-of-range coordinates in the document', () => {
    const doc = new BuildDocument(META);
    expect(() => doc.setBlock({ x: 1.5, y: 0, z: 0 }, s('minecraft:stone'))).toThrow(RangeError);
    expect(() => doc.setBlock({ x: WORLD_LIMIT, y: 0, z: 0 }, s('minecraft:stone'))).toThrow(
      RangeError,
    );
    expect(doc.getBlock(2 ** 40, 0, 0)).toBe('minecraft:air');
  });

  it('rebuilds metadata from whitelisted, typed fields', () => {
    const meta = JSON.parse(
      '{"name":"x","edition":"java","dataVersion":1,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","__proto__":{"isAdmin":true},"extra":1}',
    ) as Record<string, unknown>;
    const doc = deserializeBuild(fileWith({ metadata: meta }));
    expect(Object.keys(doc.metadata).sort()).toEqual([
      'createdAt',
      'dataVersion',
      'edition',
      'name',
      'updatedAt',
    ]);
    expect((Object.assign({}, doc.metadata) as Record<string, unknown>)['isAdmin']).toBeUndefined();
    for (const bad of [
      { dataVersion: -1.5 },
      { createdAt: 5 },
      { createdAt: 'yesterday' },
      { tags: 'notarray' },
      { remixOf: 7 },
      { name: 'x'.repeat(201) },
    ]) {
      expect(() => deserializeBuild(fileWith({ metadata: { ...META, ...bad } }))).toThrow(
        BuildFormatError,
      );
    }
  });

  it('rejects aliased, overlong and out-of-palette varints', () => {
    expect(() => decodeVarints(Uint8Array.from([0x81, 0x80, 0x80, 0x80, 0x10]), 1, 1)).toThrow();
    expect(() => decodeVarints(Uint8Array.from([0x80, 0x80, 0x00]), 1)).toThrow(/Overlong/);
    expect(() => decodeVarints(Uint8Array.from([2]), 1, 1)).toThrow(/exceeds/);
    expect(() => encodeVarints([2 ** 32])).toThrow(RangeError);
    expect([...decodeVarints(encodeVarints([2 ** 32 - 1]), 1)]).toEqual([2 ** 32 - 1]);
    // Out-of-palette index inside a file.
    expect(() => deserializeBuild(fileWith({ blocks: blocks(Uint8Array.from([5])) }))).toThrow(
      BuildFormatError,
    );
  });

  it('rejects non-zero base64 pad bits', () => {
    expect([...decodeBase64('AA==')]).toEqual([0]);
    expect(() => decodeBase64('AB==')).toThrow(/pad bits/);
    expect(() => decodeBase64('AAB=')).toThrow(/pad bits/);
  });

  it('applies change sets atomically', () => {
    const doc = new BuildDocument(META);
    expect(() =>
      doc.apply({
        origin: 'user',
        changes: [
          { pos: { x: 0, y: 0, z: 0 }, before: s('minecraft:air'), after: s('minecraft:stone') },
          { pos: { x: 0.5, y: 0, z: 0 }, before: s('minecraft:air'), after: s('minecraft:stone') },
        ],
      }),
    ).toThrow(RangeError);
    expect(doc.volume.blockCount).toBe(0);
  });

  it('serializes a large build in reasonable time', () => {
    const doc = new BuildDocument(META);
    for (let y = 0; y < 64; y++)
      for (let z = 0; z < 64; z++)
        for (let x = 0; x < 64; x++)
          if ((x + y + z) % 3 === 0) doc.setBlock({ x, y, z }, s('minecraft:stone'));
    const t = performance.now();
    const back = deserializeBuild(serializeBuild(doc) as unknown as Record<string, unknown>);
    expect(back.volume.blockCount).toBe(doc.volume.blockCount);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});
