import type { BlockStateString } from '../blockstate/blockstate';
import { BuildDocument } from '../document/build-document';
import { META } from '../document/build-document.spec';
import { decodeBase64, encodeBase64 } from './base64';
import {
  BuildFormatError,
  deserializeBuild,
  serializeBuild,
  serializeBuildToString,
} from './format';
import { decodeVarints, encodeVarints } from './varint';

const s = (v: string) => v as BlockStateString;

function sample(): BuildDocument {
  const doc = new BuildDocument(META);
  for (let x = -3; x < 5; x++)
    for (let z = 0; z < 4; z++) doc.setBlock({ x, y: 64, z }, s('minecraft:stone'));
  doc.setBlock({ x: 0, y: 65, z: 0 }, s('minecraft:oak_stairs[facing=east,half=bottom]'));
  doc.setBlock({ x: 1, y: 70, z: 2 }, s('minecraft:redstone_wire[east=side,west=none]'));
  return doc;
}

function snapshot(doc: BuildDocument): Map<string, string> {
  const m = new Map<string, string>();
  doc.volume.forEachBlock((x, y, z, i) => m.set(`${x},${y},${z}`, doc.palette.stateAt(i)));
  return m;
}

describe('base64 / varint', () => {
  it('round-trips arbitrary bytes', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37) & 255);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });
  it('round-trips varints incl. multi-byte values', () => {
    const values = [0, 1, 127, 128, 300, 16383, 16384, 65535];
    expect([...decodeVarints(encodeVarints(values), values.length)]).toEqual(values);
  });
  it('rejects truncated and trailing varint data', () => {
    expect(() => decodeVarints(Uint8Array.from([0x80]), 1)).toThrow();
    expect(() => decodeVarints(Uint8Array.from([1, 2]), 1)).toThrow();
  });
});

describe('build format v1', () => {
  it('round-trips blocks and metadata', () => {
    const doc = sample();
    const back = deserializeBuild(serializeBuildToString(doc));
    expect(snapshot(back)).toEqual(snapshot(doc));
    expect(back.metadata).toEqual(doc.metadata);
  });

  it('writes a compact palette with air first, origin and size from bounds', () => {
    const file = serializeBuild(sample());
    expect(file.palette[0]).toBe('minecraft:air');
    expect(file.palette).toHaveLength(4);
    expect(file.origin).toEqual([-3, 64, 0]);
    expect(file.size).toEqual([8, 7, 4]);
  });

  it('handles the empty build', () => {
    const doc = new BuildDocument(META);
    const file = serializeBuild(doc);
    expect(file.size).toEqual([0, 0, 0]);
    expect(deserializeBuild(file as unknown as Record<string, unknown>).volume.blockCount).toBe(0);
  });

  it('rejects newer versions, foreign formats and corrupt data', () => {
    const file = serializeBuild(sample()) as unknown as Record<string, unknown>;
    expect(() => deserializeBuild({ ...file, version: 2 })).toThrow(/newer/);
    expect(() => deserializeBuild({ ...file, format: 'other' })).toThrow(BuildFormatError);
    expect(() =>
      deserializeBuild({ ...file, blocks: { encoding: 'varint-deflate-base64', data: 'AAAA' } }),
    ).toThrow(BuildFormatError);
    expect(() => deserializeBuild({ ...file, size: [2000, 1, 1] })).toThrow(BuildFormatError);
    expect(() => deserializeBuild('{not json')).toThrow(BuildFormatError);
  });
});
