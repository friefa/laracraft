import type { TextureEntry, TextureManifest } from './manifest';

/** One attribution block: textures that share pack, origin, authors, license and changes. */
export interface CreditGroup {
  pack: string;
  title: string;
  kind: 'own' | 'third-party';
  authors: string[];
  license: string;
  licenseUrl: string;
  sourceUrl?: string;
  version?: string;
  modifications: string;
  shareAlike: boolean;
  /** Ready-to-display attribution line (TASL: title, author, source, license). */
  attribution: string;
  textures: string[];
}

export interface Credits {
  version: 1;
  /** True if any shipped texture is under a ShareAlike license. */
  shareAlike: boolean;
  groups: CreditGroup[];
}

function titleOf(manifest: TextureManifest, e: TextureEntry): string {
  return e.source.packName ?? manifest.packs[e.pack]?.title ?? e.pack;
}

export function attributionLine(g: Omit<CreditGroup, 'attribution' | 'textures'>): string {
  const parts = [`"${g.title}"${g.version ? ` (${g.version})` : ''} by ${g.authors.join(', ')}`];
  if (g.sourceUrl) parts.push(`source: ${g.sourceUrl}`);
  parts.push(`licensed under ${g.license} (${g.licenseUrl})`);
  let line = parts.join(', ');
  if (g.modifications.trim().toLowerCase() !== 'none') line += `. Changes: ${g.modifications}`;
  return line.endsWith('.') ? line : `${line}.`;
}

/** Group entries for display. Order: packs in manifest order, then by first texture name. */
export function buildCredits(manifest: TextureManifest, entries: readonly TextureEntry[]): Credits {
  const groups = new Map<string, CreditGroup>();
  const packOrder = Object.keys(manifest.packs);
  const sorted = [...entries].sort(
    (a, b) =>
      packOrder.indexOf(a.pack) - packOrder.indexOf(b.pack) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  for (const e of sorted) {
    const key = JSON.stringify([
      e.pack,
      titleOf(manifest, e),
      e.source.kind,
      e.authors,
      e.license,
      e.source.url ?? '',
      e.source.version ?? '',
      e.modifications,
    ]);
    let g = groups.get(key);
    if (!g) {
      const base = {
        pack: e.pack,
        title: titleOf(manifest, e),
        kind: e.source.kind,
        authors: [...e.authors],
        license: e.license,
        licenseUrl: e.licenseUrl,
        ...(e.source.url ? { sourceUrl: e.source.url } : {}),
        ...(e.source.version ? { version: e.source.version } : {}),
        modifications: e.modifications,
        shareAlike: e.shareAlike,
      };
      g = { ...base, attribution: attributionLine(base), textures: [] };
      groups.set(key, g);
    }
    g.textures.push(e.name);
  }
  const list = [...groups.values()];
  return { version: 1, shareAlike: list.some((g) => g.shareAlike), groups: list };
}

const LICENSES_HEADER = `# Third-party and asset licenses

> This file is generated from \`assets/textures/manifest.json\` by
> \`pnpm exec nx run textures:credits\`. Do not edit it by hand.

## Asset policy

- **No Mojang assets.** No texture, sound, model, font or logo from Minecraft (or
  derived from one) may enter this repository, not even temporarily or in tests.
  The \`textures:validate\` target rejects vanilla resource-pack paths
  (\`assets/minecraft/...\`, \`*.mcmeta\`, \`pack.png\`) and Mojang download hosts.
- **Every asset has a manifest entry** in \`assets/textures/manifest.json\` with its
  source, authors, SPDX license id, license URL, modifications and ShareAlike flag.
  Files without an entry (and entries without a file) fail validation.
- **Allowed licenses:** CC0-1.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-3.0, CC-BY-SA-4.0, MIT.
  Third-party assets additionally need a source URL and pack name, and may only be
  imported after their license and origin were verified and the source was approved
  (see ADR-0003 and \`docs/research/texture-sources.md\`).
- **ShareAlike:** CC BY-SA textures (and any texture atlas or adapted texture made from
  them) are distributed under the same license; the application code is not affected.
  Changes we make to such textures are recorded in \`modifications\`.
`;

const mdEscape = (s: string) => s.replace(/\|/g, '\\|');

export function renderLicensesMd(manifest: TextureManifest, credits: Credits): string {
  const out: string[] = [LICENSES_HEADER, '## Textures', ''];
  for (const g of credits.groups) {
    out.push(`### ${g.title} (\`${g.pack}\`)`, '');
    out.push(`- Authors: ${g.authors.join(', ')}`);
    out.push(`- License: [${g.license}](${g.licenseUrl})${g.shareAlike ? ' (ShareAlike)' : ''}`);
    out.push(`- Source: ${g.kind === 'own' ? 'own work' : (g.sourceUrl ?? 'unknown')}`);
    if (g.version) out.push(`- Version: ${g.version}`);
    out.push(`- Modifications: ${g.modifications}`);
    out.push(`- Attribution: ${g.attribution}`, '');
    out.push('| Texture | File |', '| --- | --- |');
    for (const name of g.textures) {
      const e = manifest.textures.find((t) => t.pack === g.pack && t.name === name);
      out.push(`| ${mdEscape(name)} | \`${e?.file ?? ''}\` |`);
    }
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
