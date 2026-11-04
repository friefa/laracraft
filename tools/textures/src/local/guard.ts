/**
 * Guard against shipping local (Mojang) textures, see ./local-textures.ts.
 *
 * Runs before the production web build, inside `laracraft:cap-sync` and in CI.
 * It fails if
 *  - (strict) the local mode environment switch is set,
 *  - any scanned folder contains an `atlas.json` with `"local": true`,
 *  - any scanned path goes through `.local-textures/` or `textures-local/`,
 *  - any of the `forbidPaths` exists (CI: the local folders must not exist at all).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isLocalEnv, LOCAL_ATLAS_OUT, LOCAL_ENV, LOCAL_TEXTURES_DIR } from './local-textures';

export interface GuardOptions {
  /** Workspace root; `dirs` and `forbidPaths` are relative to it. */
  root: string;
  /** Folders to scan recursively (missing folders are skipped). */
  dirs: readonly string[];
  /** Also fail if the local mode environment switch is set. */
  strict?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  /** Paths that must not exist at all. */
  forbidPaths?: readonly string[];
}

/** Folder names that only ever hold local textures. */
const LOCAL_SEGMENTS = new Set([LOCAL_TEXTURES_DIR, LOCAL_ATLAS_OUT.split('/').pop() as string]);

/** Paths the CI guard forbids by default. */
export const CI_FORBIDDEN_PATHS: readonly string[] = [LOCAL_TEXTURES_DIR, LOCAL_ATLAS_OUT];

const toPosix = (p: string) => p.split(sep).join('/');

function* walk(dir: string): Generator<string> {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) {
      yield p;
      yield* walk(p);
    } else if (d.isFile()) {
      yield p;
    }
  }
}

/** Returns a list of problems; empty means nothing local would be shipped. */
export function checkNoLocalTextures(options: GuardOptions): string[] {
  const { root, dirs, strict = false, env = {}, forbidPaths = [] } = options;
  const problems: string[] = [];
  if (strict && isLocalEnv(env)) {
    problems.push(
      `${LOCAL_ENV} is set; local textures must never reach a production/native build or CI`,
    );
  }
  for (const p of forbidPaths) {
    if (existsSync(join(root, p))) problems.push(`${p} exists; local textures must not be here`);
  }
  for (const dir of dirs) {
    const absDir = join(root, dir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const abs of [absDir, ...walk(absDir)]) {
      const rel = toPosix(relative(root, abs)) || '.';
      if (rel.split('/').some((s) => LOCAL_SEGMENTS.has(s))) {
        problems.push(`${rel}: local texture path`);
        continue;
      }
      if (!abs.endsWith('atlas.json')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(abs, 'utf8'));
      } catch {
        continue; // not ours to judge
      }
      if (typeof parsed === 'object' && parsed !== null && 'local' in parsed && parsed.local) {
        problems.push(`${rel}: atlas built from local (Mojang) textures ("local": true)`);
      }
    }
  }
  return problems;
}
