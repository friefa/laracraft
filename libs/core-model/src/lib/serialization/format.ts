import { deflateSync, Inflate } from 'fflate';
import { AIR, canonicalBlockState, type BlockStateString } from '../blockstate/blockstate';
import { BuildDocument, type BuildMetadata } from '../document/build-document';
import { isValidCoordinate, WORLD_LIMIT } from '../document/chunked-volume';
import { AIR_INDEX, MAX_PALETTE_SIZE } from '../document/palette';
import { decodeBase64, encodeBase64 } from './base64';
import { decodeVarints, encodeVarints, varintLength } from './varint';

/**
 * laracraft build file format (see docs/adr/0001-build-data-format.md).
 *
 * A JSON document. Block data is a dense array over the bounding box in YZX
 * order (index = x + z*width + y*width*length), each entry an index into
 * `palette`, varint-encoded, raw-DEFLATE-compressed, base64-encoded.
 * `palette[0]` is always `minecraft:air`.
 *
 * Loading is safe on untrusted input: every size is bounded before allocation,
 * decompression is capped at the size implied by `size` and the palette, and
 * metadata is rebuilt from whitelisted fields.
 */
export const FORMAT_ID = 'laracraft-build';
export const CURRENT_FORMAT_VERSION = 1;

/** Hard limit per axis; keeps decoding bounded on untrusted input. */
export const MAX_DIMENSION = 1024;
export const MAX_VOLUME = 64 * 1024 * 1024;
export const MAX_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAGS = 32;
export const MAX_TAG_LENGTH = 50;
/** Input slice fed to the inflater; bounds the output produced per step (DEFLATE ratio ≤ ~1032). */
const INFLATE_SLICE = 4096;

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

  // Compact palette in order of first appearance (YZX). Document palette entries
  // are canonical (BlockPalette.intern canonicalizes), so no duplicates arise.
  const palette: BlockStateString[] = [AIR];
  const remap = new Int32Array(doc.palette.size).fill(-1);
  remap[AIR_INDEX] = 0;
  const indices = new Uint32Array(volume);
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < l; z++) {
      for (let x = 0; x < w; x++) {
        const src = doc.volume.get(origin[0] + x, origin[1] + y, origin[2] + z);
        let dst = remap[src] as number;
        if (dst < 0) {
          dst = palette.length;
          palette.push(doc.palette.stateAt(src));
          remap[src] = dst;
        }
        indices[i++] = dst;
      }
    }
  }

  const data = encodeBase64(deflateSync(encodeVarints(indices), { level: 9 }));
  return {
    format: FORMAT_ID,
    version: 1,
    metadata: sanitizeMetadata(doc.metadata as unknown as Record<string, unknown>),
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
    const step = Object.hasOwn(MIGRATIONS, version) ? MIGRATIONS[version] : undefined;
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
  const maxIndex = file.palette.length - 1;
  let indices: Uint32Array;
  try {
    const raw = boundedInflate(decodeBase64(file.blocks.data), volume * varintLength(maxIndex));
    indices = decodeVarints(raw, volume, maxIndex);
  } catch (e) {
    throw new BuildFormatError(`Corrupt block data: ${(e as Error).message}`);
  }

  const doc = new BuildDocument(file.metadata);
  const docIndex = file.palette.map((entry) => doc.palette.intern(entry as BlockStateString));
  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < l; z++) {
      for (let x = 0; x < w; x++) {
        // Range-checked by decodeVarints (≤ maxIndex).
        const target = docIndex[indices[i++] as number] as number;
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
  if (!isRecord(metadata)) throw new BuildFormatError('metadata missing');
  const cleanMetadata = sanitizeMetadata(metadata);
  if (!isIntTriple(origin)) throw new BuildFormatError('origin must be [int,int,int]');
  if (!isIntTriple(size) || size.some((n) => n < 0 || n > MAX_DIMENSION)) {
    throw new BuildFormatError('size out of range');
  }
  for (let a = 0; a < 3; a++) {
    const lo = origin[a] as number;
    if (!isValidCoordinate(lo) || lo + (size[a] as number) > WORLD_LIMIT) {
      throw new BuildFormatError(`origin/size outside world range ±${WORLD_LIMIT}`);
    }
  }
  const vol = size[0] * size[1] * size[2];
  if (vol > MAX_VOLUME) throw new BuildFormatError('volume out of range');
  if (vol === 0 && size.some((n) => n !== 0)) throw new BuildFormatError('inconsistent size');
  if (!Array.isArray(palette) || palette.length === 0 || palette.length > MAX_PALETTE_SIZE) {
    throw new BuildFormatError('palette must be a non-empty array');
  }
  // Non-canonical spellings are accepted and canonicalized; unused entries are
  // tolerated (writers should compact). Duplicates after canonicalization are errors.
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
    metadata: cleanMetadata,
    origin,
    size,
    palette: canonical,
    blocks: { encoding: 'varint-deflate-base64', data: blocks['data'] },
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Rebuilds metadata from whitelisted, type-checked fields (fresh plain object,
 * no foreign keys such as `__proto__`). Throws BuildFormatError on bad input.
 */
export function sanitizeMetadata(m: Record<string, unknown>): BuildMetadata {
  const str = (key: string, max: number): string | undefined => {
    const v = Object.hasOwn(m, key) ? m[key] : undefined;
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v.length > max) {
      throw new BuildFormatError(`metadata.${key} must be a string of at most ${max} characters`);
    }
    return v;
  };
  const required = (key: string, max: number): string => {
    const v = str(key, max);
    if (v === undefined) throw new BuildFormatError(`metadata.${key} missing`);
    return v;
  };
  const date = (key: string): string => {
    const v = required(key, 40);
    if (!ISO_DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
      throw new BuildFormatError(`metadata.${key} must be an ISO 8601 timestamp`);
    }
    return v;
  };
  if (m['edition'] !== 'java') throw new BuildFormatError('Only edition "java" is supported');
  const dataVersion = m['dataVersion'];
  if (typeof dataVersion !== 'number' || !Number.isSafeInteger(dataVersion) || dataVersion < 0) {
    throw new BuildFormatError('metadata.dataVersion must be a non-negative integer');
  }
  const result: BuildMetadata = {
    name: required('name', MAX_NAME_LENGTH),
    dataVersion,
    edition: 'java',
    createdAt: date('createdAt'),
    updatedAt: date('updatedAt'),
  };
  const description = str('description', MAX_DESCRIPTION_LENGTH);
  if (description !== undefined) result.description = description;
  const tags = Object.hasOwn(m, 'tags') ? m['tags'] : undefined;
  if (tags !== undefined) {
    if (
      !Array.isArray(tags) ||
      tags.length > MAX_TAGS ||
      !tags.every((t) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TAG_LENGTH)
    ) {
      throw new BuildFormatError('metadata.tags must be a list of short strings');
    }
    result.tags = [...(tags as string[])];
  }
  const remixOf = Object.hasOwn(m, 'remixOf') ? m['remixOf'] : undefined;
  if (remixOf !== undefined) {
    const buildId = isRecord(remixOf) ? remixOf['buildId'] : undefined;
    if (!isRecord(remixOf) || typeof buildId !== 'string' || buildId.length > 100) {
      throw new BuildFormatError('metadata.remixOf.buildId must be a string');
    }
    const author = remixOf['author'];
    if (author !== undefined && (typeof author !== 'string' || author.length > MAX_NAME_LENGTH)) {
      throw new BuildFormatError('metadata.remixOf.author must be a string');
    }
    result.remixOf = author === undefined ? { buildId } : { buildId, author };
  }
  return result;
}

/**
 * Inflates raw DEFLATE data but aborts as soon as the output would exceed
 * `maxBytes` (decompression-bomb guard). Input is fed in small slices so the
 * output produced per step stays bounded too.
 *
 * Known limitation: bytes after the end of the DEFLATE stream are ignored by
 * fflate and therefore not rejected. They cannot affect the decoded blocks.
 */
function boundedInflate(input: Uint8Array, maxBytes: number): Uint8Array {
  const out = new Uint8Array(maxBytes);
  let written = 0;
  let overflow = false;
  const inflater = new Inflate((chunk) => {
    if (overflow) return;
    if (written + chunk.length > maxBytes) {
      overflow = true;
      return;
    }
    out.set(chunk, written);
    written += chunk.length;
  });
  let p = 0;
  do {
    const end = Math.min(p + INFLATE_SLICE, input.length);
    const final = end >= input.length;
    inflater.push(input.subarray(p, end), final);
    if (overflow) throw new Error('Decompressed data larger than declared size');
    p = end;
  } while (p < input.length);
  return out.subarray(0, written);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntTriple(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => Number.isSafeInteger(n));
}
