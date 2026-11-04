import { ALLOWED_LICENSES, isAllowedLicense, MANIFEST_VERSION } from './manifest';

/** A file found under assets/textures (path relative to repo root, POSIX separators). */
export interface DiskFile {
  path: string;
  /** PNG dimensions; undefined if the file is not a PNG or could not be decoded. */
  width?: number;
  height?: number;
  readError?: string;
}

export interface Issue {
  code: IssueCode;
  message: string;
}

export type IssueCode =
  | 'manifest-shape'
  | 'bad-name'
  | 'bad-path'
  | 'duplicate'
  | 'unknown-pack'
  | 'license-not-allowed'
  | 'license-url'
  | 'share-alike-mismatch'
  | 'missing-attribution'
  | 'forbidden-source'
  | 'missing-entry'
  | 'orphan-entry'
  | 'unexpected-file'
  | 'bad-size'
  | 'unreadable'
  | 'missing-required-texture';

export const TEXTURES_ROOT = 'assets/textures';
/** Non-texture files allowed directly in assets/textures. */
export const ALLOWED_META_FILES = new Set([
  `${TEXTURES_ROOT}/manifest.json`,
  `${TEXTURES_ROOT}/manifest.schema.json`,
  `${TEXTURES_ROOT}/README.md`,
]);
/** Textures every build of the atlas must be able to provide. */
export const REQUIRED_TEXTURES = ['missing'];
/** Allowed edge lengths: 16 px and power-of-two multiples up to 128 px. */
export const ALLOWED_WIDTHS = [16, 32, 64, 128];
/** Vertical animation strips may contain at most this many frames. */
export const MAX_FRAMES = 32;

/**
 * Paths that indicate Mojang-owned content (vanilla jar / resource pack layout or
 * pack metadata). Nothing in the repo may live at such a path, no matter what the
 * manifest claims.
 */
export const FORBIDDEN_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)assets\/minecraft\//i,
  /(^|\/)minecraft\/textures\//i,
  /(^|\/)textures\/(block|blocks|item|items|entity|gui|misc|environment)\//i,
  /\.mcmeta$/i,
  /(^|\/)pack\.png$/i,
  /mojang/i,
];

/** Hosts that only serve Mojang/Microsoft-owned game assets. */
export const FORBIDDEN_HOSTS: readonly RegExp[] = [
  /(^|\.)minecraft\.net$/i,
  /(^|\.)mojang\.com$/i,
  /(^|\.)minecraft\.wiki$/i,
  /(^|\.)minecraft\.fandom\.com$/i,
];

const NAME_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const PACK_RE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function isForbiddenPath(path: string): boolean {
  return FORBIDDEN_PATH_PATTERNS.some((re) => re.test(path));
}

export function isForbiddenUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return FORBIDDEN_HOSTS.some((re) => re.test(host));
}

export function checkSize(width: number, height: number): string | undefined {
  if (!ALLOWED_WIDTHS.includes(width)) {
    return `width ${width}px is not one of ${ALLOWED_WIDTHS.join('/')}px`;
  }
  if (height % width !== 0 || height / width > MAX_FRAMES) {
    return `height ${height}px must be the width (${width}px) or a multiple of it (animation strip, max ${MAX_FRAMES} frames)`;
  }
  return undefined;
}

/**
 * Validate the manifest against itself and against the files on disk.
 * Pure function: callers supply the parsed JSON and the file listing.
 */
export function validate(manifest: unknown, files: readonly DiskFile[]): Issue[] {
  const issues: Issue[] = [];
  const report = (code: IssueCode, message: string) => issues.push({ code, message });

  for (const f of files) {
    if (isForbiddenPath(f.path)) {
      report('forbidden-source', `${f.path}: path looks like Mojang/vanilla content; not allowed`);
    }
  }

  if (!isObj(manifest)) {
    report('manifest-shape', 'manifest must be a JSON object');
    return issues;
  }
  if (manifest['version'] !== MANIFEST_VERSION) {
    report('manifest-shape', `manifest.version must be ${MANIFEST_VERSION}`);
  }
  const packs = manifest['packs'];
  const packDirs = new Map<string, string>();
  if (!isObj(packs)) {
    report('manifest-shape', 'manifest.packs must be an object');
  } else {
    for (const [id, p] of Object.entries(packs)) {
      if (!PACK_RE.test(id)) report('bad-name', `packs.${id}: pack id must be snake_case`);
      if (!isObj(p) || !isNonEmptyString(p['title']) || !isNonEmptyString(p['dir'])) {
        report('manifest-shape', `packs.${id}: needs non-empty "title" and "dir"`);
        continue;
      }
      if (!isNonEmptyString(p['description'])) {
        report('manifest-shape', `packs.${id}: needs a non-empty "description"`);
      }
      const release = p['release'];
      if (release !== undefined) {
        const ok =
          isObj(release) &&
          typeof release['url'] === 'string' &&
          /^https:\/\//.test(release['url']) &&
          typeof release['downloadUrl'] === 'string' &&
          /^https:\/\//.test(release['downloadUrl']) &&
          isNonEmptyString(release['versionId']) &&
          typeof release['sha512'] === 'string' &&
          /^[0-9a-f]{128}$/.test(release['sha512']);
        if (!ok) {
          report(
            'manifest-shape',
            `packs.${id}.release: needs https "url" and "downloadUrl", "versionId" and a hex "sha512"`,
          );
        }
        for (const key of ['url', 'downloadUrl']) {
          const u = isObj(release) ? release[key] : undefined;
          if (typeof u === 'string' && isForbiddenUrl(u)) {
            report(
              'forbidden-source',
              `packs.${id}.release.${key} points to Mojang/Minecraft assets`,
            );
          }
        }
      }
      packDirs.set(id, p['dir']);
    }
  }
  const textures = manifest['textures'];
  if (!Array.isArray(textures)) {
    report('manifest-shape', 'manifest.textures must be an array');
    return issues;
  }

  const seenNames = new Set<string>();
  const entriesByFile = new Map<string, number>();
  const allNames = new Set<string>();

  textures.forEach((raw: unknown, i) => {
    const where = (e: Obj) =>
      `textures[${i}]${typeof e['pack'] === 'string' && typeof e['name'] === 'string' ? ` (${e['pack']}/${e['name']})` : ''}`;
    if (!isObj(raw)) {
      report('manifest-shape', `textures[${i}]: must be an object`);
      return;
    }
    const e = raw;
    const at = where(e);

    for (const key of ['pack', 'name', 'file', 'license', 'licenseUrl', 'modifications']) {
      if (!isNonEmptyString(e[key])) {
        report(
          key === 'modifications' ? 'missing-attribution' : 'manifest-shape',
          `${at}: "${key}" must be a non-empty string`,
        );
      }
    }
    if (typeof e['shareAlike'] !== 'boolean') {
      report('manifest-shape', `${at}: "shareAlike" must be a boolean`);
    }
    const authors = e['authors'];
    if (!Array.isArray(authors) || authors.length === 0 || !authors.every(isNonEmptyString)) {
      report('missing-attribution', `${at}: "authors" must list at least one author`);
    }

    const pack = e['pack'];
    const name = e['name'];
    const file = e['file'];
    if (typeof name === 'string') {
      if (!NAME_RE.test(name)) {
        report('bad-name', `${at}: name "${name}" must be snake_case ([a-z0-9_])`);
      }
      allNames.add(name);
    }
    if (typeof pack === 'string') {
      if (packs !== undefined && isObj(packs) && !(pack in packs)) {
        report('unknown-pack', `${at}: pack "${pack}" is not declared in manifest.packs`);
      }
      if (typeof name === 'string') {
        const key = `${pack}/${name}`;
        if (seenNames.has(key)) report('duplicate', `${at}: duplicate texture name "${key}"`);
        seenNames.add(key);
      }
    }
    if (typeof file === 'string') {
      const dir = typeof pack === 'string' ? packDirs.get(pack) : undefined;
      const prefix = dir ? `${TEXTURES_ROOT}/${dir}/` : `${TEXTURES_ROOT}/`;
      if (!file.startsWith(prefix) || !file.endsWith('.png') || file.includes('..')) {
        report('bad-path', `${at}: file "${file}" must be a .png under ${prefix}`);
      }
      if (isForbiddenPath(file)) {
        report('forbidden-source', `${at}: file "${file}" looks like a Mojang/vanilla path`);
      }
      if (entriesByFile.has(file)) {
        report(
          'duplicate',
          `${at}: file "${file}" is already claimed by textures[${entriesByFile.get(file)}]`,
        );
      } else {
        entriesByFile.set(file, i);
      }
    }

    const license = e['license'];
    if (typeof license === 'string') {
      if (!isAllowedLicense(license)) {
        report(
          'license-not-allowed',
          `${at}: license "${license}" is not in the allow-list (${Object.keys(ALLOWED_LICENSES).join(', ')})`,
        );
      } else {
        const info = ALLOWED_LICENSES[license];
        const url = e['licenseUrl'];
        if (typeof url === 'string' && !url.startsWith(info.url)) {
          report('license-url', `${at}: licenseUrl for ${license} must start with ${info.url}`);
        }
        if (typeof e['shareAlike'] === 'boolean' && e['shareAlike'] !== info.shareAlike) {
          report(
            'share-alike-mismatch',
            `${at}: shareAlike must be ${info.shareAlike} for ${license}`,
          );
        }
      }
    }

    const source = e['source'];
    if (!isObj(source) || (source['kind'] !== 'own' && source['kind'] !== 'third-party')) {
      report('manifest-shape', `${at}: "source.kind" must be "own" or "third-party"`);
    } else {
      const url = source['url'];
      if (url !== undefined && !isNonEmptyString(url)) {
        report('manifest-shape', `${at}: "source.url" must be a non-empty string if present`);
      }
      if (typeof url === 'string' && isForbiddenUrl(url)) {
        report('forbidden-source', `${at}: source.url "${url}" points to Mojang/Minecraft assets`);
      }
      if (source['kind'] === 'third-party') {
        if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
          report('missing-attribution', `${at}: third-party texture needs an https "source.url"`);
        }
        if (!isNonEmptyString(source['packName'])) {
          report('missing-attribution', `${at}: third-party texture needs "source.packName"`);
        }
      }
    }
  });

  // Disk <-> manifest consistency.
  for (const f of files) {
    if (ALLOWED_META_FILES.has(f.path)) continue;
    if (!f.path.toLowerCase().endsWith('.png')) {
      report('unexpected-file', `${f.path}: only .png textures and manifest files are allowed`);
      continue;
    }
    if (!entriesByFile.has(f.path)) {
      report('missing-entry', `${f.path}: no manifest entry (add one to manifest.json)`);
    }
    if (f.readError !== undefined) {
      report('unreadable', `${f.path}: cannot decode PNG (${f.readError})`);
    } else if (f.width !== undefined && f.height !== undefined) {
      const problem = checkSize(f.width, f.height);
      if (problem) report('bad-size', `${f.path}: ${problem}`);
    }
  }
  const onDisk = new Set(files.map((f) => f.path));
  for (const [file, i] of entriesByFile) {
    if (!onDisk.has(file)) {
      report('orphan-entry', `textures[${i}]: file "${file}" does not exist`);
    }
  }
  for (const req of REQUIRED_TEXTURES) {
    if (!allNames.has(req)) {
      report('missing-required-texture', `required texture "${req}" has no manifest entry`);
    }
  }
  return issues;
}
