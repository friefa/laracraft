# textures (tool)

Texture pipeline with license manifest. Pure TypeScript, run with `tsx`, PNG I/O via
`pngjs`. Nx project `textures` (tag `type:tool`).

| Target                           | What it does                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nx run textures:validate`       | Checks `assets/textures/**` against `assets/textures/manifest.json` and that `assets/LICENSES.md` is up to date. Exit code 1 with a list of `[code] message` lines on failure. |
| `nx run textures:atlas`          | Packs the selected textures into `dist/assets/textures/atlas.png` + `atlas.json`.                                                                                              |
| `nx run textures:credits`        | Writes `dist/assets/textures/credits.json` (in-app Credits screen) and regenerates `assets/LICENSES.md`.                                                                       |
| `nx run textures:placeholders`   | Regenerates the CC0 programmer-art PNGs in `assets/textures/placeholder/` (deterministic).                                                                                     |
| `nx run textures:test` / `:lint` | Vitest / ESLint.                                                                                                                                                               |
| `nx run textures:import-ppl`     | Imports the needed block textures from Pixel Perfection Legacy, see below.                                                                                                     |

Options (pass after `--`, e.g. `nx run textures:atlas -- --packs placeholder`):

- `--packs a,b` – pack priority order for `atlas` and `credits`. For each texture name the
  first pack that provides it wins, so a partial pack falls back to the placeholders.
  Default: `pixel_perfection_legacy,placeholder`, then any other pack in manifest order
  (`DEFAULT_PACK_PRIORITY` in `src/lib/manifest.ts`).
- `--padding n` – edge extrusion in pixels (default 2, `atlas` only).
- `--out dir` – output directory relative to the workspace root (default `dist/assets/textures`).

## Manifest (`assets/textures/manifest.json`)

JSON schema: `assets/textures/manifest.schema.json`. Types: `src/lib/manifest.ts`.

```jsonc
{
  "$schema": "./manifest.schema.json",
  "version": 1,
  "packs": {
    "placeholder": {
      "title": "…",
      "description": "…",
      "dir": "placeholder",
      "homepage": "optional",
      // optional, for packs imported from a pinned upstream archive:
      "release": {
        "url": "https://…",
        "versionId": "…",
        "downloadUrl": "https://…",
        "sha512": "…",
      },
    },
  },
  "textures": [
    {
      "pack": "placeholder", // key into packs; file must live in assets/textures/<dir>/
      "name": "grass_block_side", // laracraft texture name, snake_case, unique per pack
      "file": "assets/textures/placeholder/grass_block_side.png",
      "source": {
        "kind": "own", // or "third-party"
        "url": "https://…", // required (https) for third-party
        "packName": "Pixel Perfection", // required for third-party (CC 3.0 needs the title)
        "version": "1.11",
        "commit": "<sha>",
        "originalPath": "upstream/path.png",
      },
      "authors": ["laracraft contributors"], // at least one
      "license": "CC0-1.0", // SPDX id from the allow-list
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "modifications": "none", // what we changed; "none" if verbatim
      "shareAlike": false, // must be true exactly for CC-BY-SA-*
    },
  ],
}
```

Validation rules (`src/lib/validate.ts`):

- every file under `assets/textures/` is a PNG with exactly one entry (only
  `manifest.json`, `manifest.schema.json` and `README.md` are exempt); every entry's file exists;
- license in the allow-list `CC0-1.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-3.0, CC-BY-SA-4.0, MIT`;
  `licenseUrl` matches the license; `shareAlike` matches the license;
- at least one author and a non-empty `modifications`; third-party entries need `source.url`
  (https) and `source.packName`;
- size: width 16/32/64/128 px; height equal to the width or a multiple of it (vertical
  animation strip, max 32 frames);
- forbidden: vanilla resource-pack layouts (`assets/minecraft/…`, `minecraft/textures/…`,
  `textures/block|item|entity|…/`), `*.mcmeta`, `pack.png`, anything containing `mojang`, and
  source URLs on minecraft.net / mojang.com / minecraft.wiki / minecraft.fandom.com;
- a `missing` texture must exist.

## Atlas output (consumed by the renderer, M1)

`atlas.png` is a power-of-two RGBA PNG (non-square allowed, max 4096). `atlas.json`:

```jsonc
{
  "version": 1,
  "image": "atlas.png",
  "width": 128,
  "height": 64,
  "padding": 2,
  "uvOrigin": "top-left", // v grows downwards, like image rows
  "packs": ["placeholder"],
  "textures": {
    "stone": {
      "x": 2,
      "y": 2,
      "w": 16,
      "h": 16, // pixel rect, padding excluded
      "u0": 0.015625,
      "v0": 0.03125,
      "u1": 0.140625,
      "v1": 0.28125,
      "frames": 1, // h / w; >1 = vertical animation strip
      "pack": "placeholder",
    },
  },
}
```

Renderer notes:

- Look up faces by texture name; unknown names must fall back to `missing`.
- three.js uploads with `flipY = true` by default: use `v = 1 - v0/v1` (or set
  `texture.flipY = false` and use the values as-is).
- Use `NearestFilter` for magnification. Every tile is surrounded by `padding` px of
  extruded edge pixels, which keeps linear filtering and the first mip level
  (`padding = 2` → level 1) free of bleeding. For deeper mip chains limit the level count
  or move to a `DataArrayTexture` (one layer per texture) later.
- For animated textures (`frames > 1`) the rect covers the whole strip; frame `i` is the
  sub-rect `y + i * w`. Padding is applied around the strip only.
- Ship `credits.json` next to the atlas and show `groups[].attribution` in the Credits
  screen; it only lists textures that are actually in the atlas.

## Importing Pixel Perfection Legacy (ADR-0003)

`pixel_perfection_legacy` is the default pack; `placeholder` fills the gaps. The import is
reproducible from checked-in data in `src/import/ppl-mapping.ts`:

- `PPL_RELEASE` – pinned Modrinth version (id, download URL, sha512), also recorded in the
  manifest's `packs.pixel_perfection_legacy.release`.
- `PPL_TEXTURE_MAP` – laracraft texture name → PNG file name in the pack's block folder
  (`null` = not available as a block texture; falls back to `missing`). Every registry
  texture name must have a row (`src/import/ppl-coverage.spec.ts`).
- `XSSHEEP_REFERENCE` / `INTRODUCED_AFTER_XSSHEEP` – reference for per-file authorship.

```sh
# 1. Download the release zip (PPL_RELEASE.downloadUrl) into an empty scratch directory.
# 2. Reference files: the first commit of Pixel Perfection CE.
git clone --no-checkout https://github.com/Athemis/PixelPerfectionCE ref-repo
mkdir ref && git -C ref-repo archive acbdb5612acddf998188fc268116508105b44d90 \
  assets/minecraft/textures/block | tar -x -C ref
# 3. Import, then regenerate attribution files.
pnpm exec nx run textures:import-ppl -- --zip <pack.zip> --reference ref [--report report.json]
pnpm exec nx run textures:credits
```

The importer verifies the zip's sha512, reads only the mapped PNGs from the archive (no
`.mcmeta`, credits or other files), re-encodes them without metadata chunks (pixels
unchanged), writes `assets/textures/pixel_perfection_legacy/<name>.png` and replaces that
pack's manifest entries. Animation strips are copied as strips; their `.mcmeta` timing is
not imported (frames are equally long in our atlas).

Authorship per file (`src/import/compare.ts`): decoded pixels are compared with the
reference (fully transparent pixels count as equal). Only files that are pixel-identical
**and** belong to blocks that existed up to Java 1.11 are credited to Hugh "XSSheep"
Rutland ("Renamed"). Everything else – changed pixels, files missing from the reference, or
blocks added after 1.11 (the reference already contains community updates for 1.14/1.15) –
is credited to "Nova_Wostra, Pixel Perfection Legacy contributors, Hugh "XSSheep" Rutland
(original)" ("Renamed; adapted/extended by Pixel Perfection Legacy contributors").
