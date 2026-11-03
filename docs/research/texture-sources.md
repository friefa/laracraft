# Texture sources – license research

Status: research input for ADR-0003 (texture source, _Proposed_). Date: 2026-11-03.
Nothing in this document authorises importing third-party files; that needs the product
owner's approval of ADR-0003 and then goes through `tools/textures` (manifest + validator).

Legend: **[V]** verified from a primary source (quoted/linked below) ·
**[S]** verified only from a secondary source / search-engine excerpt of the primary page ·
**[A]** assumption or interpretation, not verified.

## 1. Summary

| Question                     | Answer                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| License of Pixel Perfection  | **CC BY-SA 4.0** (Creative Commons Attribution-ShareAlike 4.0 International) [V via VoxeLibre `LEGAL.md` and the GitHub mirror README; S for XSSheep's own page].                                                                                                                                        |
| Author to credit             | **Hugh "XSSheep" Rutland**; for the Luanti/Minetest port additionally Toby109tt, tacotexmex, devurandom [V].                                                                                                                                                                                             |
| Is VoxeLibre's set all PP?   | **No.** "Most textures are verbatim copies" of Pixel Perfection 1.11, but many were changed or redone, and several mods carry their own authors and licenses (CC BY-SA 3.0, CC BY 4.0, CC0, "CC-BY-SA" without version) [V].                                                                             |
| Share-alike scope            | Applies to the textures, to any texture we modify, and (conservatively) to the atlas built from them. Does **not** extend to the app's code [A, based on CC BY-SA 4.0 §3(b) and CC FAQ on collections]. App-store DRM is an open legal point (see §4.4).                                                 |
| Coverage for our ~150 blocks | Good: all base building blocks, all 16-colour sets, 11 wood families and the classic redstone set exist in VoxeLibre. Missing: crafter, copper bulb and other 1.21-era redstone parts. Only pre-1.12 blocks are guaranteed to originate from PP 1.11 itself [V for presence, A for per-file provenance]. |
| Recommendation               | Import from the **original Pixel Perfection (single author, single license)**, not wholesale from VoxeLibre. Take individual extra files from VoxeLibre only with per-file provenance. Keep CC0 placeholders as fallback for everything else.                                                            |

## 2. Sources consulted

1. VoxeLibre `LEGAL.md`, GitHub mirror, commit `4492ce6ff8d856daa4567abe2ea689f4e7a39842`
   (2026-09-15): <https://github.com/VoxeLibre/VoxeLibre/blob/master/LEGAL.md>.
   The canonical repo <https://git.minetest.land/VoxeLibre/VoxeLibre> was not fetchable
   (bot protection); the GitHub repository is VoxeLibre's official mirror.
2. VoxeLibre `CREDITS.md` (same commit), section "Textures".
3. VoxeLibre `mods/ITEMS/REDSTONE/README`, `mods/ITEMS/mcl_bamboo/README.md`,
   `mods/ITEMS/mcl_deepslate/README.md` (same commit).
4. File listing of the same commit (2,926 PNG files) for the coverage check.
5. Pixel Perfection, Luanti/Minetest port: <https://github.com/minetest-texture-packs/Pixel-Perfection>
   (README).
6. Original publication by XSSheep on Planet Minecraft:
   <https://www.planetminecraft.com/texture-pack/131pixel-perfection/> — direct fetch returned
   HTTP 403; content known only from search-engine excerpts.
7. Mineclonia (older fork) README commit:
   <https://bytes.keithhacks.cyou/etc/Mineclonia/commit/9456e90aba7bfbc2a87dcef12c0fa1270bb3fa34>.
8. Creative Commons FAQ: <https://creativecommons.org/faq/> and license text
   <https://creativecommons.org/licenses/by-sa/4.0/legalcode>.
9. Kenney Voxel Pack: <https://kenney.nl/assets/voxel-pack>.
10. Minetest Game `default` mod README:
    <https://github.com/minetest/minetest_game/blob/68192a17e9ce85950528778d2ff769dd4a8ec7f5/mods/default/README.txt>.

## 3. Findings

### 3.1 License and author of Pixel Perfection

- [V] VoxeLibre `LEGAL.md`, "License of media (textures and sounds)":

  > The textures, unless otherwise noted, are based on the Pixel Perfection resource pack for
  > Minecraft 1.11, authored by XSSheep. Most textures are verbatim copies, while some textures
  > have been changed or redone from scratch.
  > …
  > Source: <https://www.planetminecraft.com/texture_pack/131pixel-perfection/>
  > License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

  (In the file the Source/License bullets follow the glazed-terracotta sentence; the
  formatting is ambiguous, but the Planet Minecraft URL is XSSheep's Pixel Perfection page, so
  the bullets describe Pixel Perfection.)

- [V] Pixel-Perfection README (Luanti port): "by Hugh "XSSheep" Rutland … Contributors:
  Toby109tt, tacotexmex, devurandom … Licensing: Creative Commons Attribution-Share Alike 4.0
  International License".
- [S] XSSheep's Planet Minecraft page (search excerpt): "Pixel Perfection by XSSheep is
  licensed under a Creative Commons Attribution-Share Alike 4.0 International License" and
  "feel free to use these textures in any mixpack or whatever you want (paid or unpaid)" with a
  request for credit.
- [V] Conflict: an older Mineclonia README states the Pixel-Perfection-based textures are
  "CC BY-SA 3.0 unless otherwise noted". This is a downstream statement, contradicted by the
  author's page and by current VoxeLibre. CC BY-SA 3.0 §4(b) also lets adaptations be licensed
  under a later version with the same elements, so the difference does not block us; we use
  **CC-BY-SA-4.0** in the manifest for PP-original files.
- [A] No later relicensing (e.g. to CC0 or CC BY) was found.
- [A] Pixel Perfection is a fan resource pack drawn in the style of vanilla Minecraft. We
  assume it is original pixel work, not traced from Mojang's textures. Its long use in
  ContentDB-listed free games (which reject non-free media) supports this, but nobody has
  verified it. Before import, visually spot-check a sample of files to confirm they are
  clearly distinct redraws. Never download vanilla assets for this comparison.

### 3.2 Does everything in VoxeLibre derive from Pixel Perfection? No.

Per-file provenance in VoxeLibre is mixed [V unless marked]:

| Area                              | Author(s)                                                                                                                               | License stated                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Most block/item textures          | XSSheep (Pixel Perfection 1.11), partly changed or redrawn                                                                              | CC BY-SA 4.0                                                                     |
| Glazed terracotta                 | MysticTempest                                                                                                                           | listed next to CC BY-SA 4.0 (ambiguous formatting)                               |
| Charcoal block                    | blitzdoughnuts (based on PP coal block)                                                                                                 | CC BY-SA 4.0                                                                     |
| Cherry wood and tree              | Nova_Wostra ("Pixel Perfection Legacy"), refined by EmoryNB                                                                             | CC BY-SA 4.0                                                                     |
| Cherry particles                  | Wbjitscool, EmoryNB                                                                                                                     | CC BY-SA 4.0                                                                     |
| Armor trims                       | Aeonix_Aeon                                                                                                                             | CC BY 4.0                                                                        |
| Redstone mods (Mesecons heritage) | Jeija, VanessaE, sfan5, temperest, minerd247; light detectors by Lifora                                                                 | "Media license: CC BY-SA 3.0"                                                    |
| Bamboo                            | Nicu; bamboo item by RandomLegoBrick (CC0)                                                                                              | "CC-BY-SA except where noted" (no version)                                       |
| Deepslate                         | NO11 – "Textures are from Pixel Perfection!"                                                                                            | not stated; PP 1.11 had no deepslate [A: from a later community PP continuation] |
| Everything else not mentioned     | VoxeLibre contributors (CREDITS "Textures": XSSheep, Wuzzy, kingoscargames, leorockway, xMrVizzy, yutyo, NO11, kay27, MysticTempest, …) | "CC BY-SA 3.0" (LEGAL.md fallback)                                               |

Consequence: a file taken from the VoxeLibre tree cannot be credited as "Pixel Perfection,
CC BY-SA 4.0" by default. Each file needs its mod README and git history checked. This is the
main reason for the recommendation in §5.

### 3.3 Coverage (VoxeLibre tree, commit `4492ce6`) [V presence; A provenance]

Pixel Perfection 1.11 can only contain blocks that existed in Minecraft 1.11. Everything later
(concrete, glazed terracotta, deepslate, copper, cherry, bamboo, sculk, …) comes from other
artists (§3.2) [A, from release history].

| Category                                                                                                                                                                                                | In VoxeLibre                                                                         | Likely PP 1.11 origin                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Stone, cobblestone, mossy, stone bricks, granite/diorite/andesite, sand(stone), gravel, dirt, grass, obsidian, glass, ores, quartz, prismarine, sea lantern, ice, snow                                  | yes                                                                                  | yes                                                                                             |
| Wood: oak, spruce, birch, jungle, acacia, dark oak (logs, planks, doors, trapdoors)                                                                                                                     | yes                                                                                  | yes                                                                                             |
| Wood: mangrove, cherry, bamboo, crimson, warped                                                                                                                                                         | yes                                                                                  | no (later artists)                                                                              |
| Wool (16), stained glass + panes (16), terracotta (16)                                                                                                                                                  | yes                                                                                  | yes                                                                                             |
| Concrete (16), concrete powder (16), glazed terracotta (16)                                                                                                                                             | yes                                                                                  | no (1.12+; glazed = MysticTempest; concrete author not documented)                              |
| Redstone dust, torch, block, lamp, lever, repeater, comparator, piston, sticky piston, observer, dispenser, dropper, hopper, note block, TNT, slime block, rails (normal, powered, detector, activator) | yes (`mesecons_*`, `mcl_comparators_*`, `mcl_observers_*`, `mcl_minecarts_rail_*` …) | mostly yes, but Mesecons-derived files may be CC BY-SA 3.0 by Mesecons authors – check per file |
| Daylight detector                                                                                                                                                                                       | yes (`vl_sensors_*`, by Lifora)                                                      | no                                                                                              |
| Target, honey block, sculk sensor, copper, deepslate                                                                                                                                                    | yes                                                                                  | no                                                                                              |
| Crafter, copper bulb, trial-chamber blocks                                                                                                                                                              | **no**                                                                               | –                                                                                               |

Buttons and pressure plates reuse their base block texture. VoxeLibre uses Luanti names
(`default_stone.png`, `mcl_core_planks_birch.png`, `mesecons_delayer_*`), so an import needs a
name-mapping table to our names, recorded in `source.originalPath`.

## 4. What ShareAlike means for us

### 4.1 What the license requires (CC BY-SA 4.0 §3)

When we share the textures, or anything adapted from them, we must [V, license text]:

- credit the creator (and any attribution parties they name), keep any copyright, license and
  disclaimer notices they supplied, and give a URI to the source where that is reasonably
  practicable;
- link the license;
- **indicate modifications** and keep an indication of earlier ones;
- license **adapted material** under BY-SA 4.0 or a compatible license (ShareAlike);
- not add terms or **effective technological measures (DRM)** that restrict the licensed
  rights (§2(a)(5)(C)).

For CC BY-SA 3.0 files the attribution must also give the **title** of the work, which is
why the manifest requires `source.packName` [V, CC FAQ].

### 4.2 Scope

- **Texture files and textures we edit** (recolours, crops, redrawn pixels): BY-SA 4.0, with
  changes noted in the manifest `modifications` field. Renaming alone is not an adaptation [A].
- **Texture atlas**: packing unmodified tiles into one image is closer to a _collection_ than
  an adaptation. The CC FAQ says SA does not require the collection itself to be under SA, but
  each tile keeps its license. We will still **treat the generated atlas as BY-SA 4.0**
  (conservative, costs nothing) and ship `credits.json` / license notice with it [A].
  Our CC0 placeholders in the same atlas stay CC0.
- **Application code** (Angular app, engine libs, renderer): not adapted material. Code that
  loads and displays an image does not adapt it, and the CC FAQ treats game art as a separable
  element. SA therefore does **not** make the app open source [A, standard reading, consistent
  with free games shipping BY-SA art next to code under other licenses].
- **User output**: exported Minecraft files (`.schem`, `.litematic`, `.nbt`) contain block IDs
  only, no textures, so they are unaffected. Screenshots or renders that show the textures
  contain licensed material [A]. Suggest an optional "Textures: Pixel Perfection by XSSheep,
  CC BY-SA 4.0" caption on exported images, which is low risk.

### 4.3 What the credits must say

Suggested attribution text, generated by `credits.json` → Credits screen, `assets/LICENSES.md`,
store listing and the website:

> Block textures based on "Pixel Perfection" by Hugh "XSSheep" Rutland
> (<https://www.planetminecraft.com/texture-pack/131pixel-perfection/>), licensed under
> CC BY-SA 4.0 (<https://creativecommons.org/licenses/by-sa/4.0/>). Modified by laracraft
> contributors: renamed and packed into a texture atlas[; further edits listed in LICENSES.md].
> The texture atlas is distributed under CC BY-SA 4.0. Placeholder textures: CC0 1.0,
> laracraft contributors.

If we import from the Luanti port (source 5), add "with contributions by Toby109tt,
tacotexmex and devurandom". Any non-PP file gets its own line from its manifest entry.

### 4.4 Open legal point: app-store DRM [A – needs legal review]

iOS App Store binaries are FairPlay-encrypted. CC BY-SA 4.0 §2(a)(5)(C) forbids applying
technological measures that restrict recipients' exercise of the licensed rights. §2(a)(4)
lets recipients circumvent such measures, which mitigates this but may not settle it.
Usual mitigation (assumed adequate, not verified): also publish the textures and the
generated atlas DRM-free under BY-SA 4.0, e.g. in a public repo or website download linked
from the Credits screen. The ADR should record this as a condition.

## 5. Recommendation for ADR-0003

1. Primary source: the **original Pixel Perfection** by XSSheep, CC BY-SA 4.0. Prefer the
   git-traceable Luanti port (source 5, record `source.commit`), or archive the original
   Planet Minecraft download with its checksum. Single author and single license keep the
   credits simple.
2. Pin the exact upstream version or commit. Verify the license text inside the downloaded
   archive (a LICENSE or readme file, if any) before import; this has not been done, because
   no third-party file may enter the repo before approval.
3. Pixel Perfection is a Minecraft resource pack, laid out as `assets/minecraft/textures/...`.
   The importer must map files to our names and directories (`assets/textures/pixel_perfection/<name>.png`).
   The validator deliberately rejects vanilla layouts, `*.mcmeta` and `pack.png`. Never commit
   the pack archive itself.
4. For blocks PP 1.11 lacks (concrete, glazed terracotta, newer woods, …), choose per block:
   - take the VoxeLibre file, but only after reading its mod README and git log and writing a
     per-file manifest entry with the real author or license (often CC BY-SA 3.0 or 4.0); or
   - draw our own (CC0); or
   - keep the placeholder (`--packs pixel_perfection,placeholder` falls back automatically).
5. Treat the atlas as BY-SA 4.0, ship `credits.json`, publish textures and atlas DRM-free
   (§4.4), and keep the app code under its own license.

## 6. Alternatives (briefly)

| Option                           | License                                                                  | Fit                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kenney Voxel Pack**            | CC0 [V, kenney.nl: "Creative Commons CC0", 190 files, tile size 128×128] | No attribution or SA duties. Minecraft-like but generic: about 190 tiles, no redstone components, colour sets or most wood types. Tiles are 128 px; downscaling to 16 px is allowed (CC0) but must be redrawn by hand for good results. Good complement to the placeholders, poor primary pack. |
| **Minetest Game textures**       | CC BY-SA 3.0, many named authors (celeron55, Cisoun, PilzAdam, …) [S]    | Free and well documented per file. Different style, no redstone or colour-block coverage, and more attribution lines than PP. No advantage over PP.                                                                                                                                             |
| **Own / commissioned art (CC0)** | CC0 (our choice)                                                         | Zero legal risk and no attribution duties. Cost is drawing about 200 textures; can be done gradually because the pipeline falls back to placeholders.                                                                                                                                           |
