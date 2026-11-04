/**
 * Texture pipeline CLI. Run from the workspace root via Nx:
 *   nx run textures:validate | atlas | credits | placeholders | own-textures | guard
 * Options: --packs a,b (priority order for atlas/credits; default: pixel_perfection_legacy,
 *          placeholder, then other packs in manifest order), --padding n, --out dir
 * atlas:   --local (or env LARACRAFT_LOCAL_TEXTURES=1) puts `.local-textures/` first and
 *          writes a `"local": true` atlas to dist/assets/textures-local (P1.11, local only).
 * guard:   --dir d (repeatable), --strict, --ci; fails if local textures would be shipped.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { buildAtlas, type AtlasInput } from './lib/atlas';
import { buildCredits, renderLicensesMd } from './lib/credits';
import { defaultPackOrder, selectTextures, type TextureManifest } from './lib/manifest';
import { OWN_PACK, OWN_TEXTURE_NAMES, renderOwnTexture } from './lib/own-textures';
import { PLACEHOLDER_NAMES, renderPlaceholder } from './lib/placeholders';
import { readPng, writePng } from './lib/png';
import { TEXTURES_ROOT, validate, type DiskFile } from './lib/validate';
import { CI_FORBIDDEN_PATHS, checkNoLocalTextures } from './local/guard';
import {
  applyLocalTextures,
  isLocalEnv,
  LOCAL_ATLAS_OUT,
  LOCAL_PACK,
  LOCAL_TEXTURES_DIR,
} from './local/local-textures';

const ROOT = resolve(import.meta.dirname, '../../..');
const MANIFEST = `${TEXTURES_ROOT}/manifest.json`;
const LICENSES_MD = 'assets/LICENSES.md';
const PLACEHOLDER_DIR = `${TEXTURES_ROOT}/placeholder`;
const OWN_DIR = `${TEXTURES_ROOT}/${OWN_PACK}`;
const PPL_DIR = `${TEXTURES_ROOT}/pixel_perfection_legacy`;
const DEFAULT_OUT = 'dist/assets/textures';

const abs = (p: string) => join(ROOT, p);
const toPosix = (p: string) => p.split(sep).join('/');

function listFiles(dir: string): string[] {
  if (!existsSync(abs(dir))) return [];
  return readdirSync(abs(dir), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => toPosix(relative(ROOT, join(d.parentPath, d.name))))
    .sort();
}

function scanDisk(): DiskFile[] {
  return listFiles(TEXTURES_ROOT).map((path) => {
    if (!path.toLowerCase().endsWith('.png')) return { path };
    try {
      const { width, height } = readPng(abs(path));
      return { path, width, height };
    } catch (err) {
      return { path, readError: err instanceof Error ? err.message : String(err) };
    }
  });
}

async function prettify(text: string, filePath: string): Promise<string> {
  const config = (await resolveConfig(filePath)) ?? {};
  return format(text, { ...config, filepath: filePath });
}

async function renderLicenses(manifest: TextureManifest): Promise<string> {
  const credits = buildCredits(manifest, manifest.textures);
  return prettify(renderLicensesMd(manifest, credits), abs(LICENSES_MD));
}

/** Validate and return the typed manifest, or exit with a readable error list. */
async function loadValidManifest(checkLicensesFile: boolean): Promise<TextureManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs(MANIFEST), 'utf8'));
  } catch (err) {
    fail([`${MANIFEST}: ${err instanceof Error ? err.message : String(err)}`]);
  }
  const files = scanDisk();
  const messages = validate(raw, files).map((i) => `[${i.code}] ${i.message}`);
  const manifest = raw as TextureManifest;
  if (messages.length === 0 && checkLicensesFile) {
    const expected = await renderLicenses(manifest);
    const actual = existsSync(abs(LICENSES_MD)) ? readFileSync(abs(LICENSES_MD), 'utf8') : '';
    if (expected !== actual) {
      messages.push(
        `[stale-licenses] ${LICENSES_MD} is out of date; run: pnpm exec nx run textures:credits`,
      );
    }
  }
  if (messages.length > 0) fail(messages);
  return manifest;
}

function fail(messages: string[]): never {
  console.error(`Texture validation failed (${messages.length} problem(s)):`);
  for (const m of messages) console.error(`  - ${m}`);
  process.exit(1);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  writeFileSync(path, await prettify(JSON.stringify(data), path));
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      packs: { type: 'string' },
      padding: { type: 'string', default: '2' },
      out: { type: 'string' },
      local: { type: 'boolean', default: false },
      dir: { type: 'string', multiple: true },
      strict: { type: 'boolean', default: false },
      ci: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  const packOrderArg = values.packs?.split(',').map((p) => p.trim());
  const local = command === 'atlas' && (values.local || isLocalEnv(process.env));
  const outDir = abs(values.out ?? (local ? LOCAL_ATLAS_OUT : DEFAULT_OUT));
  // The guard recognises local output by this folder name, so never write it elsewhere.
  if (local && !toPosix(relative(ROOT, outDir)).split('/').includes('textures-local')) {
    fail([`[local-out] the local atlas must go to a "textures-local" folder (${LOCAL_ATLAS_OUT})`]);
  }

  switch (command) {
    case 'validate': {
      const manifest = await loadValidManifest(true);
      console.log(
        `OK: ${manifest.textures.length} texture(s) in ${Object.keys(manifest.packs).length} pack(s) validated.`,
      );
      return;
    }
    case 'atlas': {
      const manifest = await loadValidManifest(false);
      const packOrder = packOrderArg ?? defaultPackOrder(manifest);
      const entries = selectTextures(manifest, packOrder);
      const inputs: AtlasInput[] = entries.map((e) => ({ name: e.name, ...readPng(abs(e.file)) }));
      const sources = Object.fromEntries(entries.map((e) => [e.name, e.pack]));
      if (local) {
        if (listFiles(LOCAL_TEXTURES_DIR).every((f) => !f.endsWith('.png'))) {
          fail([
            `[local-missing] no textures in ${LOCAL_TEXTURES_DIR}/; run: pnpm exec nx run ` +
              'textures:import-local -- --jar <path to your client.jar>',
          ]);
        }
        const { replaced, skipped } = applyLocalTextures(inputs, abs(LOCAL_TEXTURES_DIR));
        for (const s of skipped) console.warn(`skipping local texture ${s}`);
        for (const name of replaced) sources[name] = LOCAL_PACK;
        console.log(`Local mode: ${replaced.length} texture(s) from ${LOCAL_TEXTURES_DIR}/`);
      }
      const padding = Number(values.padding);
      if (!Number.isInteger(padding) || padding < 0 || padding > 8) {
        throw new Error('--padding must be an integer 0..8');
      }
      const { layout, image } = buildAtlas(inputs, { padding });
      mkdirSync(outDir, { recursive: true });
      writePng(join(outDir, 'atlas.png'), image);
      await writeJson(join(outDir, 'atlas.json'), {
        version: 1,
        // Marker checked by the guard: this atlas contains the developer's own Mojang textures.
        ...(local ? { local: true } : {}),
        image: 'atlas.png',
        width: layout.width,
        height: layout.height,
        padding: layout.padding,
        uvOrigin: 'top-left',
        packs: local ? [LOCAL_PACK, ...packOrder] : packOrder,
        textures: Object.fromEntries(
          Object.entries(layout.rects).map(([n, r]) => [n, { ...r, pack: sources[n] }]),
        ),
      });
      console.log(
        `Atlas ${layout.width}x${layout.height} with ${entries.length} texture(s) -> ${relative(ROOT, outDir)}`,
      );
      return;
    }
    case 'credits': {
      const manifest = await loadValidManifest(false);
      const packOrder = packOrderArg ?? defaultPackOrder(manifest);
      const credits = buildCredits(manifest, selectTextures(manifest, packOrder));
      mkdirSync(outDir, { recursive: true });
      await writeJson(join(outDir, 'credits.json'), credits);
      writeFileSync(abs(LICENSES_MD), await renderLicenses(manifest));
      console.log(`Wrote ${relative(ROOT, join(outDir, 'credits.json'))} and ${LICENSES_MD}`);
      return;
    }
    case 'placeholders': {
      mkdirSync(abs(PLACEHOLDER_DIR), { recursive: true });
      for (const name of PLACEHOLDER_NAMES) {
        writePng(abs(`${PLACEHOLDER_DIR}/${name}.png`), renderPlaceholder(name));
      }
      console.log(`Wrote ${PLACEHOLDER_NAMES.length} placeholder(s) to ${PLACEHOLDER_DIR}`);
      console.log(
        'Run `nx run textures:validate` to check that all of them have manifest entries.',
      );
      return;
    }
    case 'own-textures': {
      mkdirSync(abs(OWN_DIR), { recursive: true });
      const load = (name: string) => readPng(abs(`${PPL_DIR}/${name}.png`));
      for (const name of OWN_TEXTURE_NAMES) {
        writePng(abs(`${OWN_DIR}/${name}.png`), renderOwnTexture(name, load));
      }
      console.log(`Wrote ${OWN_TEXTURE_NAMES.length} own texture(s) to ${OWN_DIR}`);
      return;
    }
    case 'guard': {
      const dirs = values.dir ?? [DEFAULT_OUT];
      const problems = checkNoLocalTextures({
        root: ROOT,
        dirs,
        strict: values.strict || values.ci,
        env: process.env,
        forbidPaths: values.ci ? CI_FORBIDDEN_PATHS : [],
      });
      if (problems.length > 0) {
        console.error(
          `LOCAL TEXTURE GUARD FAILED: Mojang textures from the local developer mode (P1.11) ` +
            `must never be built, synced, uploaded or committed (${problems.length} problem(s)):`,
        );
        for (const p of problems) console.error(`  - ${p}`);
        console.error(
          `Rebuild without --local / LARACRAFT_LOCAL_TEXTURES (pnpm exec nx run textures:atlas).`,
        );
        process.exit(1);
      }
      console.log(`OK: no local textures in ${dirs.join(', ')}`);
      return;
    }
    default:
      console.error(
        'usage: cli.ts <validate|atlas|credits|placeholders|own-textures|guard> [--packs a,b] [--padding n] [--out dir] [--local]',
      );
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
