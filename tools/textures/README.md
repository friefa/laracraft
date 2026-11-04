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
| `nx run textures:own-textures`   | Regenerates our own drawings in `assets/textures/laracraft_own/` (deterministic), see below.                                                                                   |
| `nx run textures:import-ppl`     | Imports the needed block textures from Pixel Perfection Legacy, see below.                                                                                                     |
| `nx run textures:import-local`   | Local developer mode only: extracts textures from your own `client.jar` into `.local-textures/`, see below.                                                                    |
| `nx run textures:guard-no-local` | Fails if a local (Mojang) atlas would be shipped. Runs before every `laracraft:build`.                                                                                         |

Options (pass after `--`, e.g. `nx run textures:atlas -- --packs placeholder`):

- `--packs a,b` – pack priority order for `atlas` and `credits`. For each texture name the
  first pack that provides it wins, so a partial pack falls back to the placeholders.
  Default: `laracraft_own,pixel_perfection_legacy,placeholder`, then any other pack in manifest order
  (`DEFAULT_PACK_PRIORITY` in `src/lib/manifest.ts`).
- `--padding n` – edge extrusion in pixels (default 2, `atlas` only).
- `--out dir` – output directory relative to the workspace root (default `dist/assets/textures`).
- `--local` – `atlas` only: local developer texture mode, see below.

`atlas` is not cached by Nx (it takes about a second), so a local-mode atlas never ends up in
a (possibly remote) Nx cache.

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

## Own textures (`laracraft_own`)

Textures Pixel Perfection Legacy lacks or that break its style (ADR-0003) are drawn by
`src/lib/own-textures.ts` and written by `nx run textures:own-textures`; the manifest
entries are maintained by hand. The pack comes first in the default priority, so it also
overrides PPL files (`observer_front`).

- **License: CC BY-SA 4.0**, credited to laracraft contributors and the PPL authors. The
  drawings are new, but adapted to PPL: colours are sampled from PPL textures and
  `observer_front` keeps the frame of PPL's `observer_side` (read from
  `assets/textures/pixel_perfection_legacy/` at generation time). A purely original
  drawing without PPL pixels or colours could be CC0 in its own entry.
- **Chest:** `chest_front` (with the latch), `chest_side` (sides and back), `chest_top`
  (lid and bottom). The model is a 14 px box with auto-UV, so only columns 1..14 (top:
  rows 1..14, sides: rows 2..15) are visible; the border repeats its neighbours. Double
  chest halves use the `_left` / `_right` variants: 15 px slices of one 30 px drawing, so
  there is no frame at the seam and the latch is shared.

## Local developer texture mode (P1.11, local only)

Developers who own Minecraft Java Edition can render laracraft with the original textures
of **their own installation**. Mojang's textures are not licensed for redistribution, so
the hard rules are (ADR-0003): no Mojang file is ever committed, uploaded as a CI artifact,
cached remotely, bundled into a production or native build, or downloaded by our tooling.
The tool only reads a `client.jar` you already have.

```sh
# 1. Extract the block textures we need (path to your own jar, e.g.
#    ~/.minecraft/versions/1.21.4/1.21.4.jar on Linux/macOS,
#    %APPDATA%\.minecraft\versions\<version>\<version>.jar on Windows).
pnpm exec nx run textures:import-local -- --jar <path to client.jar>
# 2. Build the local atlas (or: LARACRAFT_LOCAL_TEXTURES=1 pnpm exec nx run textures:atlas).
pnpm exec nx run textures:atlas -- --local
# 3. Run the dev server with it (builds the local atlas itself).
pnpm exec nx serve laracraft --configuration=local-textures
```

How it works:

- `import-local` reads only the PNGs in `VANILLA_TEXTURE_MAP` (`src/local/local-textures.ts`):
  every registry texture name plus the extra model textures of `PPL_TEXTURE_MAP`, mapped to
  `assets/minecraft/textures/block/<file>` (PPL uses the vanilla layout, so its file names are
  reused, e.g. `redstone_dust` → `redstone_dust_dot.png`; differences go into
  `VANILLA_OVERRIDES`). They are re-encoded (pixels unchanged) to `.local-textures/<name>.png`
  at the workspace root. That folder is git-, Prettier- and ESLint-ignored, carries its own
  `.gitignore`, is outside `assets/textures/` (so the validator never sees it) and is never in
  the manifest, `credits.json` or `LICENSES.md`. Textures the atlas does not accept (e.g.
  animation strips with more than 32 frames) are skipped and fall back to the packs.
- `atlas --local` (or `LARACRAFT_LOCAL_TEXTURES=1`) gives `.local-textures/` the highest
  priority (atlas pack id `local`) and writes **only** to `dist/assets/textures-local/`; the
  normal output `dist/assets/textures/` is never touched, and `--out` must contain a
  `textures-local` folder. The generated `atlas.json` has the marker `"local": true`.
- `laracraft:build:local-textures` (development options) serves the normal
  `dist/assets/textures/` minus `atlas.*` plus `dist/assets/textures-local/` as
  `assets/textures/`. Credits stay those of the packs. Nx runs `textures:atlas:local-textures`
  for it automatically (`laracraft:serve:local-textures` uses this build configuration).

Guards (tests in `src/local/*.spec.ts`, using a synthetic jar built in the test):

- `textures:guard-no-local` (`cli.ts guard --strict`) runs before every `laracraft:build`,
  including `nx build laracraft` and the build behind `cap-sync`. It fails if
  `LARACRAFT_LOCAL_TEXTURES` is set or `dist/assets/textures/` contains a local atlas or local
  path. Only its `local-textures` configuration (used by `laracraft:build:local-textures`)
  skips the environment check.
- `laracraft:cap-sync` runs `guard --strict --dir dist/apps/laracraft` before `cap sync`, so a
  web build containing a `"local": true` atlas never reaches the native projects.
- CI runs `guard --ci --dir dist` before uploading artifacts: it also fails if
  `.local-textures/` or `dist/assets/textures-local/` exist at all.
