/**
 * Texture license manifest (assets/textures/manifest.json).
 *
 * The manifest is the single source of truth for every texture file that is
 * allowed in the repository. Keep this file in sync with
 * assets/textures/manifest.schema.json (editor support / documentation); the
 * runtime checks live in validate.ts.
 */

export const MANIFEST_VERSION = 1;

/** SPDX identifiers we accept for textures. Anything else needs a policy change. */
export const ALLOWED_LICENSES = {
  'CC0-1.0': { url: 'https://creativecommons.org/publicdomain/zero/1.0/', shareAlike: false },
  'CC-BY-3.0': { url: 'https://creativecommons.org/licenses/by/3.0/', shareAlike: false },
  'CC-BY-4.0': { url: 'https://creativecommons.org/licenses/by/4.0/', shareAlike: false },
  'CC-BY-SA-3.0': { url: 'https://creativecommons.org/licenses/by-sa/3.0/', shareAlike: true },
  'CC-BY-SA-4.0': { url: 'https://creativecommons.org/licenses/by-sa/4.0/', shareAlike: true },
  MIT: { url: 'https://opensource.org/license/mit', shareAlike: false },
} as const satisfies Record<string, { url: string; shareAlike: boolean }>;

export type LicenseId = keyof typeof ALLOWED_LICENSES;

export function isAllowedLicense(id: string): id is LicenseId {
  return Object.prototype.hasOwnProperty.call(ALLOWED_LICENSES, id);
}

export interface TextureSource {
  /** `own`: made by laracraft contributors. `third-party`: anything else. */
  kind: 'own' | 'third-party';
  /** Where the original was obtained (required for third-party). */
  url?: string;
  /** Title of the original work / pack (required by CC 3.0 attribution). */
  packName?: string;
  /** Upstream version of the pack, e.g. "1.11". */
  version?: string;
  /** Upstream VCS commit the file was taken from, if any. */
  commit?: string;
  /** Path of the file inside the upstream source, for traceability. */
  originalPath?: string;
}

export interface TextureEntry {
  /** Pack id, key into `packs`. */
  pack: string;
  /** laracraft texture name (snake_case), unique within its pack. */
  name: string;
  /** Path relative to the repository root, e.g. assets/textures/placeholder/stone.png. */
  file: string;
  source: TextureSource;
  authors: string[];
  /** SPDX license identifier, see ALLOWED_LICENSES. */
  license: string;
  licenseUrl: string;
  /** What we changed relative to the source ("none" if verbatim). */
  modifications: string;
  /** True if the license carries a ShareAlike obligation; must match the license. */
  shareAlike: boolean;
}

export interface PackInfo {
  title: string;
  description: string;
  /** Directory relative to assets/textures that holds this pack's files. */
  dir: string;
  homepage?: string;
  /** Pinned upstream release the files were imported from (third-party packs). */
  release?: PackRelease;
}

export interface PackRelease {
  /** Release / version page (https). */
  url: string;
  /** Upstream version id, e.g. a Modrinth version id. */
  versionId: string;
  /** Direct download URL of the archive (https). */
  downloadUrl: string;
  /** Lowercase hex SHA-512 of the downloaded archive. */
  sha512: string;
}

export interface TextureManifest {
  $schema?: string;
  version: number;
  packs: Record<string, PackInfo>;
  textures: TextureEntry[];
}

/**
 * Default pack priority for atlas/credits: the real texture pack first, the CC0
 * placeholders as fallback. Declared packs not listed here follow in manifest order.
 */
export const DEFAULT_PACK_PRIORITY: readonly string[] = ['pixel_perfection_legacy', 'placeholder'];

export function defaultPackOrder(manifest: TextureManifest): string[] {
  const declared = Object.keys(manifest.packs);
  const preferred = DEFAULT_PACK_PRIORITY.filter((p) => declared.includes(p));
  return [...preferred, ...declared.filter((p) => !preferred.includes(p))];
}

/**
 * Pick one entry per texture name for the given pack priority order: the first
 * pack that provides a name wins, so a partial third-party pack can fall back to
 * placeholders. Result is sorted by name.
 */
export function selectTextures(
  manifest: TextureManifest,
  packOrder: readonly string[] = defaultPackOrder(manifest),
): TextureEntry[] {
  for (const p of packOrder) {
    if (!(p in manifest.packs)) throw new Error(`unknown pack "${p}"`);
  }
  const chosen = new Map<string, TextureEntry>();
  for (const pack of packOrder) {
    for (const e of manifest.textures) {
      if (e.pack === pack && !chosen.has(e.name)) chosen.set(e.name, e);
    }
  }
  return [...chosen.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
