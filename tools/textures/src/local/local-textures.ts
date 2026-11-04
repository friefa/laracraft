/**
 * Local-only developer texture mode (Roadmap P1.11, ADR-0003).
 *
 * A developer may render laracraft with the textures of THEIR OWN installed
 * Minecraft Java Edition. The files are read from a `client.jar` path the
 * developer provides, written to the git-ignored `.local-textures/` folder and
 * packed into a separate atlas under `dist/assets/textures-local/` that is
 * marked with `"local": true`. Mojang files must never be committed, uploaded,
 * bundled into a production/native build or downloaded by our tooling; the
 * guard in `./guard.ts` enforces that for builds, Capacitor sync and CI.
 *
 * This module contains no network code on purpose.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import type { AtlasInput } from '../lib/atlas';
import { decodePng, readPng, type RgbaImage } from '../lib/png';
import { checkSize } from '../lib/validate';
import { PPL_TEXTURE_MAP } from '../import/ppl-mapping';

/** Workspace-relative folder for the extracted textures (git-ignored). */
export const LOCAL_TEXTURES_DIR = '.local-textures';
/** Workspace-relative output folder of the local atlas (never the normal output). */
export const LOCAL_ATLAS_OUT = 'dist/assets/textures-local';
/** Environment switch equivalent to `atlas --local`. */
export const LOCAL_ENV = 'LARACRAFT_LOCAL_TEXTURES';
/** Pack id used for local textures in atlas.json (never a manifest pack). */
export const LOCAL_PACK = 'local';
/** Block texture folder inside a vanilla client.jar. */
export const VANILLA_BLOCK_DIR = 'assets/minecraft/textures/block';

/** True if the environment switches the atlas into local mode. */
export function isLocalEnv(env: Readonly<Record<string, string | undefined>>): boolean {
  const v = env[LOCAL_ENV]?.trim().toLowerCase();
  return v !== undefined && v !== '' && v !== '0' && v !== 'false' && v !== 'no';
}

/**
 * Vanilla file names that differ from the Pixel Perfection Legacy mapping. PPL
 * uses the vanilla resource-pack layout, so its file names are reused as-is
 * (e.g. `redstone_dust` -> `redstone_dust_dot.png`); add a row here when the
 * vanilla name differs. `null` = no vanilla block texture (falls back).
 */
export const VANILLA_OVERRIDES: Readonly<Record<string, string | null>> = {};

/**
 * laracraft texture name -> PNG file name in the jar's block folder. Covers the
 * registry texture names and the extra model texture names of PPL_TEXTURE_MAP.
 */
export const VANILLA_TEXTURE_MAP: Readonly<Record<string, string | null>> = {
  ...PPL_TEXTURE_MAP,
  ...VANILLA_OVERRIDES,
};

export interface JarExtraction {
  /** laracraft name -> decoded image, for every mapped texture found in the jar. */
  images: Map<string, RgbaImage>;
  /** Mapped names whose file is not in the jar. */
  absent: string[];
  /** Mapped names whose file could not be used (`name: reason`). */
  rejected: string[];
  /** `id` from the jar's version.json, if present. */
  versionId?: string;
}

/**
 * Read exactly the mapped block PNGs from a client.jar (a zip). Nothing else is
 * decompressed; nothing is written. Throws if the archive is not a Java client jar.
 */
export function extractFromJar(
  jar: Uint8Array,
  map: Readonly<Record<string, string | null>> = VANILLA_TEXTURE_MAP,
): JarExtraction {
  const wanted = new Map<string, string[]>(); // zip path -> our names
  for (const [name, file] of Object.entries(map)) {
    if (!file) continue;
    const path = `${VANILLA_BLOCK_DIR}/${file}`;
    wanted.set(path, [...(wanted.get(path) ?? []), name]);
  }
  let sawBlockDir = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(jar, {
      filter: (f) => {
        if (f.name.startsWith(`${VANILLA_BLOCK_DIR}/`)) sawBlockDir = true;
        return wanted.has(f.name) || f.name === 'version.json';
      },
    });
  } catch (err) {
    throw new Error(`not a readable jar/zip: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  if (!sawBlockDir) {
    throw new Error(`no ${VANILLA_BLOCK_DIR}/ folder found; is this a Minecraft Java client.jar?`);
  }

  const images = new Map<string, RgbaImage>();
  const absent: string[] = [];
  const rejected: string[] = [];
  for (const [name, file] of Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const bytes = file ? files[`${VANILLA_BLOCK_DIR}/${file}`] : undefined;
    if (!bytes) {
      absent.push(name);
      continue;
    }
    let image: RgbaImage;
    try {
      image = decodePng(Buffer.from(bytes));
    } catch (err) {
      rejected.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const sizeProblem = checkSize(image.width, image.height);
    if (sizeProblem) {
      rejected.push(`${name}: ${sizeProblem}`);
      continue;
    }
    images.set(name, image);
  }

  let versionId: string | undefined;
  const version = files['version.json'];
  if (version) {
    try {
      const id = (JSON.parse(new TextDecoder().decode(version)) as { id?: unknown }).id;
      if (typeof id === 'string') versionId = id;
    } catch {
      // version.json is informational only
    }
  }
  return { images, absent, rejected, versionId };
}

/**
 * Local mode: replace atlas inputs (in place) with same-named PNGs from `localDir`,
 * giving them the highest priority. Only names the atlas already contains and that
 * are in VANILLA_TEXTURE_MAP are considered.
 */
export function applyLocalTextures(
  inputs: AtlasInput[],
  localDir: string,
): { replaced: string[]; skipped: string[] } {
  const replaced: string[] = [];
  const skipped: string[] = [];
  for (const [i, input] of inputs.entries()) {
    if (!(input.name in VANILLA_TEXTURE_MAP)) continue;
    const file = join(localDir, `${input.name}.png`);
    if (!existsSync(file)) continue;
    let image: RgbaImage;
    try {
      image = readPng(file);
    } catch (err) {
      skipped.push(`${input.name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const sizeProblem = checkSize(image.width, image.height);
    if (sizeProblem) {
      skipped.push(`${input.name}: ${sizeProblem}`);
      continue;
    }
    inputs[i] = { name: input.name, ...image };
    replaced.push(input.name);
  }
  return { replaced, skipped };
}

/** Text of the README written into `.local-textures/`. */
export const LOCAL_README = `LOCAL ONLY - DO NOT COMMIT, UPLOAD OR SHIP

These block textures were extracted from your own Minecraft Java Edition client.jar
by \`nx run textures:import-local\`. They are Mojang's property and may only be used
locally for development. This folder is git-ignored and is never part of the texture
manifest, the credits or any production/native build. See tools/textures/README.md.
`;
