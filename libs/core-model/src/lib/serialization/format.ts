import { deflateSync, inflateSync } from 'fflate';
import { canonicalBlockState, type BlockStateString, AIR } from '../blockstate/blockstate';
import { BuildDocument, type BuildMetadata } from '../document/build-document';
import { AIR_INDEX } from '../document/palette';
import { decodeBase64, encodeBase64 } from './base64';
import { decodeVarints, encodeVarints } from './varint';

/**
 * laracraft build file format (see docs/adr/0001-build-data-format.md).
 *
 * A JSON document. Block data is a dense array over the bounding box in YZX
 * order (index = x + z*width + y*width*length), each entry an index into
 * `palette`, varint-encoded, raw-DEFLATE-compressed, base64-encoded.
 * `palette[0]` is always `minecraft:air`.
 */
export const FORMAT_ID = 'laracraft-build';
export const CURRENT_FORMAT_VERSION = 1;

/** Hard limit per axis; keeps decoding bounded on untrusted input. */
export const MAX_DIMENSION = 1024;
export const MAX_VOLUME = 64 * 1024 * 1024;

export interface BuildFileV1 {
  format: typeof FORMAT_ID;
  version: 1;
  metadata: BuildMetadata;
  /** Document coordinate of the box's min corner. */
  origin: [number, number, number];
  /** [width (x), height (y), length (z)]. [0,0,0] for an empty build. */
  size: [number, number, number];
  palette: string[];
  blocks: { encoding: 'varint-deflate-base64'; data: string };
}

export class BuildFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildFormatError';
  }
}

export function serializeBuild(doc: BuildDocument): BuildFileV1 {
  const bounds = doc.volume.bounds();
  const origin: [number, number, number] = bounds
    ? [bounds.min.x, bounds.min.y, bounds.min.z]
    : [0, 0, 0];
  const size: [number, number, number] = bounds
    ? [
        bounds.max.x - bounds.min.x + 1,
        bounds.max.y - bounds.min.y + 1,
        bounds.max.z - bounds.min.z + 1,
      ]
    : [0, 0, 0];
  const [w, h, l] = size;
  const volume = w * h * l;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION || l > MAX_DIMENSION || volume > MAX_VOLUME) {
    throw new BuildFormatError(`Build too large to serialize: ${w}x${h}x${l}`);
  }

  // Compact palette: only states in use, air first, in order of first appearance (YZX).
  const palette: BlockStateString[] = [AIR];
  const remap = new Map<number, number>([[AIR_INDEX, 0]]);
  const indices = new Uint32Array(volume);
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < l; z++) {
      for (let x = 0; x < w; x++) {
        const src = doc.volume.get(origin[0] + x, origin[1] + y, origin[2] + z);
        let dst = remap.get(src);
        if (dst === undefined) {
          dst = palette.length;
          palette.push(doc.palette.stateAt(src));
          remap.set(src, dst);
        }
        indices[i++] = dst;
      }
    }
  }

  const data = encodeBase64(deflateSync(encodeVarints(indices), { level: 9 }));
  return {
    format: FORMAT_ID,
    version: 1,
    metadata: structuredCloneMetadata(doc.metadata),
    origin,
    size,
    palette,
    blocks: { encoding: 'varint-deflate-base64', data },
  };
}

export function serializeBuildToString(doc: BuildDocument): string {
  return JSON.stringify(serializeBuild(doc));
}

/**
 * Migrations from version N to N+1. Each receives the raw parsed JSON of
 * version N and returns raw JSON of version N+1. Add an entry for every
 * format bump; never edit an existing one.
 */
export const MIGRATIONS: Readonly<
  Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>
> = {};

export function migrateToCurrent(raw: Record<string, unknown>): BuildFileV1 {
  if (raw['format'] !== FORMAT_ID) throw new BuildFormatError('Not a laracraft build file');
  let version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BuildFormatError(`Invalid format version ${String(version)}`);
  }
  if (version > CURRENT_FORMAT_VERSION) {
    throw new BuildFormatError(
      `File format version ${version} is newer than supported (${CURRENT_FORMAT_VERSION})`,
    );
  }
  let current = raw;
  while (version < CURRENT_FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new BuildFormatError(`No migration from version ${version}`);
    current = step(current);
    version++;
  }
  return validateV1(current);
}

export function deserializeBuild(input: string | Record<string, unknown>): BuildDocument {
  let raw: unknown;
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new BuildFormatError('Invalid JSON');
  }
  if (!isRecord(raw)) throw new BuildFormatError('Root must be an object');
  const file = migrateToCurrent(raw);

  const [w, h, l] = file.size;
  const volume = w * h * l;
  let indices: Uint32Array;
  try {
    indices = decodeVarints(inflateSync(decodeBase64(file.blocks.data)), volume);
  } catch (e) {
    throw new BuildFormatError(`Corrupt block data: ${(e as Error).message}`);
  }

  const doc = new BuildDocument(file.metadata);
  const docIndex = file.palette.map((s) => doc.palette.intern(s as BlockStateString));
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < l; z++) {
      for (let x = 0; x < w; x++) {
        const p = indices[i++] as number;
        const target = docIndex[p];
        if (target === undefined) throw new BuildFormatError(`Palette index ${p} out of range`);
        if (target !== AIR_INDEX) {
          doc.volume.set(file.origin[0] + x, file.origin[1] + y, file.origin[2] + z, target);
        }
      }
    }
  }
  doc.volume.takeDirtyChunks();
  return doc;
}

function validateV1(raw: Record<string, unknown>): BuildFileV1 {
  const { metadata, origin, size, palette, blocks } = raw;
  if (!isRecord(metadata) || typeof metadata['name'] !== 'string') {
    throw new BuildFormatError('metadata.name missing');
  }
  if (metadata['edition'] !== 'java')
    throw new BuildFormatError('Only edition "java" is supported');
  if (typeof metadata['dataVersion'] !== 'number')
    throw new BuildFormatError('metadata.dataVersion missing');
  if (!isIntTriple(origin)) throw new BuildFormatError('origin must be [int,int,int]');
  if (!isIntTriple(size) || size.some((n) => n < 0 || n > MAX_DIMENSION)) {
    throw new BuildFormatError('size out of range');
  }
  const vol = size[0] * size[1] * size[2];
  if (vol > MAX_VOLUME) throw new BuildFormatError('volume out of range');
  if (vol === 0 && size.some((n) => n !== 0)) throw new BuildFormatError('inconsistent size');
  if (!Array.isArray(palette) || palette.length === 0 || palette.length > 65535) {
    throw new BuildFormatError('palette must be a non-empty array');
  }
  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const entry of palette) {
    if (typeof entry !== 'string') throw new BuildFormatError('palette entries must be strings');
    let c: string;
    try {
      c = canonicalBlockState(entry);
    } catch (e) {
      throw new BuildFormatError((e as Error).message);
    }
    if (seen.has(c)) throw new BuildFormatError(`duplicate palette entry ${c}`);
    seen.add(c);
    canonical.push(c);
  }
  if (canonical[0] !== AIR) throw new BuildFormatError('palette[0] must be minecraft:air');
  if (
    !isRecord(blocks) ||
    blocks['encoding'] !== 'varint-deflate-base64' ||
    typeof blocks['data'] !== 'string'
  ) {
    throw new BuildFormatError('unsupported block encoding');
  }
  return {
    format: FORMAT_ID,
    version: 1,
    metadata: metadata as unknown as BuildMetadata,
    origin,
    size,
    palette: canonical,
    blocks: { encoding: 'varint-deflate-base64', data: blocks['data'] },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntTriple(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => Number.isSafeInteger(n));
}

function structuredCloneMetadata(m: BuildMetadata): BuildMetadata {
  return JSON.parse(JSON.stringify(m)) as BuildMetadata;
}
