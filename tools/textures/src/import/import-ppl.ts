/**
 * Import the block textures laracraft needs from Pixel Perfection Legacy (ADR-0003).
 *
 *   pnpm exec nx run textures:import-ppl -- --zip <pack.zip> --reference <dir> [--report out.json]
 *
 * --zip        the release zip from PPL_RELEASE.downloadUrl; its sha512 must match.
 *              Only the PNGs named in PPL_TEXTURE_MAP are read (nothing is executed
 *              or extracted to disk).
 * --reference  checkout or `git archive` of XSSHEEP_REFERENCE at the pinned commit
 *              (the folder that contains `assets/`, or the block folder itself).
 * --report     optional path for a JSON report of the per-file comparison.
 *
 * Writes assets/textures/pixel_perfection_legacy/<name>.png (pixels unchanged,
 * re-encoded without metadata chunks) and replaces that pack's manifest entries.
 * Afterwards run `nx run textures:credits` to regenerate the attribution files.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { unzipSync } from 'fflate';
import { format, resolveConfig } from 'prettier';
import { collectTextureNames, createJavaBlockRegistry } from '@laracraft/core-model';
import {
  ALLOWED_LICENSES,
  type PackInfo,
  type TextureEntry,
  type TextureManifest,
} from '../lib/manifest';
import { decodePng, encodePng, type RgbaImage } from '../lib/png';
import { checkSize, TEXTURES_ROOT } from '../lib/validate';
import { classifyAuthorship, type Authorship } from './compare';
import {
  ADAPTED_AUTHORS,
  ADAPTED_MODIFICATIONS,
  INTRODUCED_AFTER_XSSHEEP,
  PPL_RELEASE,
  PPL_TEXTURE_MAP,
  XSSHEEP_AUTHORS,
  XSSHEEP_MODIFICATIONS,
  XSSHEEP_REFERENCE,
} from './ppl-mapping';

const ROOT = resolve(import.meta.dirname, '../../../..');
const MANIFEST = join(ROOT, TEXTURES_ROOT, 'manifest.json');
const PACK_DIR = PPL_RELEASE.packId;
const LICENSE = 'CC-BY-SA-4.0';

interface ReportRow {
  name: string;
  file: string;
  width: number;
  height: number;
  authorship: Authorship;
  reason: string;
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function pplPackInfo(): PackInfo {
  return {
    title: PPL_RELEASE.packName,
    description:
      `Block textures from Pixel Perfection Legacy ${PPL_RELEASE.version} (Nova_Wostra and contributors, ` +
      `continuation of Pixel Perfection by Hugh "XSSheep" Rutland), CC BY-SA 4.0 per ADR-0003. ` +
      `Imported by tools/textures/src/import/import-ppl.ts: only the block PNGs laracraft needs, renamed ` +
      `to laracraft texture names and re-encoded without metadata (pixels unchanged). ` +
      `source.originalPath is relative to the pack's block texture folder. Authorship per file is ` +
      `decided by pixel comparison with ${XSSHEEP_REFERENCE.repo} @ ${XSSHEEP_REFERENCE.commit.slice(0, 7)}.`,
    dir: PACK_DIR,
    homepage: PPL_RELEASE.homepage,
    release: {
      url: PPL_RELEASE.url,
      versionId: PPL_RELEASE.versionId,
      downloadUrl: PPL_RELEASE.downloadUrl,
      sha512: PPL_RELEASE.sha512,
    },
  };
}

function entryFor(name: string, file: string, authorship: Authorship): TextureEntry {
  const xssheep = authorship === 'xssheep';
  return {
    pack: PACK_DIR,
    name,
    file: `${TEXTURES_ROOT}/${PACK_DIR}/${name}.png`,
    source: {
      kind: 'third-party',
      url: PPL_RELEASE.url,
      packName: PPL_RELEASE.packName,
      version: PPL_RELEASE.version,
      originalPath: file,
    },
    authors: [...(xssheep ? XSSHEEP_AUTHORS : ADAPTED_AUTHORS)],
    license: LICENSE,
    licenseUrl: ALLOWED_LICENSES[LICENSE].url,
    modifications: xssheep ? XSSHEEP_MODIFICATIONS : ADAPTED_MODIFICATIONS,
    shareAlike: true,
  };
}

function readReference(dir: string, file: string): RgbaImage | undefined {
  const nested = join(dir, XSSHEEP_REFERENCE.blockDir);
  const path = join(existsSync(nested) ? nested : dir, file);
  return existsSync(path) ? decodePng(readFileSync(path)) : undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      zip: { type: 'string' },
      reference: { type: 'string' },
      report: { type: 'string' },
    },
  });
  if (!values.zip || !values.reference) {
    die('usage: import-ppl.ts --zip <pack.zip> --reference <dir> [--report out.json]');
  }

  const zipBytes = readFileSync(resolve(values.zip));
  const sha512 = createHash('sha512').update(zipBytes).digest('hex');
  if (sha512 !== PPL_RELEASE.sha512) {
    die(
      `sha512 mismatch for ${values.zip}:\n  got      ${sha512}\n  expected ${PPL_RELEASE.sha512}`,
    );
  }

  const registryNames = collectTextureNames(createJavaBlockRegistry());
  const unmapped = registryNames.filter((n) => !(n in PPL_TEXTURE_MAP));
  if (unmapped.length > 0) {
    die(`registry texture names without a PPL_TEXTURE_MAP row: ${unmapped.join(', ')}`);
  }

  const wanted = new Map<string, string>(); // zip path -> our name
  for (const [name, file] of Object.entries(PPL_TEXTURE_MAP)) {
    if (file) wanted.set(`${PPL_RELEASE.blockDir}/${file}`, name);
  }
  const zip = unzipSync(zipBytes, { filter: (f) => wanted.has(f.name) });

  const outDir = join(ROOT, TEXTURES_ROOT, PACK_DIR);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const rows: ReportRow[] = [];
  const absent: string[] = [];
  const entries: TextureEntry[] = [];
  for (const [name, file] of Object.entries(PPL_TEXTURE_MAP).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const bytes = file ? zip[`${PPL_RELEASE.blockDir}/${file}`] : undefined;
    if (!file || !bytes) {
      absent.push(name);
      continue;
    }
    const image = decodePng(Buffer.from(bytes));
    const sizeProblem = checkSize(image.width, image.height);
    if (sizeProblem) die(`${file}: ${sizeProblem}`);
    const reference = readReference(resolve(values.reference), file);
    const verdict = classifyAuthorship(image, reference, INTRODUCED_AFTER_XSSHEEP[name]);
    writeFileSync(join(outDir, `${name}.png`), encodePng(image));
    entries.push(entryFor(name, file, verdict.authorship));
    rows.push({ name, file, width: image.width, height: image.height, ...verdict });
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as TextureManifest;
  // The PPL pack goes first: manifest order is the default atlas priority.
  manifest.packs = {
    [PACK_DIR]: pplPackInfo(),
    ...Object.fromEntries(Object.entries(manifest.packs).filter(([id]) => id !== PACK_DIR)),
  };
  manifest.textures = [...entries, ...manifest.textures.filter((e) => e.pack !== PACK_DIR)];
  const config = (await resolveConfig(MANIFEST)) ?? {};
  writeFileSync(
    MANIFEST,
    await format(JSON.stringify(manifest), { ...config, filepath: MANIFEST }),
  );

  if (values.report) {
    writeFileSync(resolve(values.report), `${JSON.stringify({ absent, rows }, null, 2)}\n`);
  }
  const xssheep = rows.filter((r) => r.authorship === 'xssheep').length;
  console.log(
    `Imported ${rows.length} texture(s) into ${TEXTURES_ROOT}/${PACK_DIR}: ` +
      `${xssheep} XSSheep-identical, ${rows.length - xssheep} adapted/extended.`,
  );
  if (absent.length > 0) console.log(`Not available in the pack (fallback): ${absent.join(', ')}`);
  console.log(`Files in ${PACK_DIR}: ${readdirSync(outDir).length}. Next: nx run textures:credits`);
}

main().catch((err: unknown) => {
  die(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
