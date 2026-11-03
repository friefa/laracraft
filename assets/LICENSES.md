# Third-party and asset licenses

> This file is generated from `assets/textures/manifest.json` by
> `pnpm exec nx run textures:credits`. Do not edit it by hand.

## Asset policy

- **No Mojang assets.** No texture, sound, model, font or logo from Minecraft (or
  derived from one) may enter this repository, not even temporarily or in tests.
  The `textures:validate` target rejects vanilla resource-pack paths
  (`assets/minecraft/...`, `*.mcmeta`, `pack.png`) and Mojang download hosts.
- **Every asset has a manifest entry** in `assets/textures/manifest.json` with its
  source, authors, SPDX license id, license URL, modifications and ShareAlike flag.
  Files without an entry (and entries without a file) fail validation.
- **Allowed licenses:** CC0-1.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-3.0, CC-BY-SA-4.0, MIT.
  Third-party assets additionally need a source URL and pack name, and may only be
  imported after their license and origin were verified and the source was approved
  (see ADR-0003 and `docs/research/texture-sources.md`).
- **ShareAlike:** CC BY-SA textures (and any texture atlas or adapted texture made from
  them) are distributed under the same license; the application code is not affected.
  Changes we make to such textures are recorded in `modifications`.

## Textures

### laracraft placeholder textures (`placeholder`)

- Authors: laracraft contributors
- License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Source: own work
- Modifications: none
- Attribution: "laracraft placeholder textures" by laracraft contributors, licensed under CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/).

| Texture          | File                                               |
| ---------------- | -------------------------------------------------- |
| cobblestone      | `assets/textures/placeholder/cobblestone.png`      |
| dirt             | `assets/textures/placeholder/dirt.png`             |
| glass            | `assets/textures/placeholder/glass.png`            |
| grass_block_side | `assets/textures/placeholder/grass_block_side.png` |
| grass_block_top  | `assets/textures/placeholder/grass_block_top.png`  |
| gravel           | `assets/textures/placeholder/gravel.png`           |
| missing          | `assets/textures/placeholder/missing.png`          |
| oak_log          | `assets/textures/placeholder/oak_log.png`          |
| oak_log_top      | `assets/textures/placeholder/oak_log_top.png`      |
| oak_planks       | `assets/textures/placeholder/oak_planks.png`       |
| obsidian         | `assets/textures/placeholder/obsidian.png`         |
| redstone_block   | `assets/textures/placeholder/redstone_block.png`   |
| redstone_lamp    | `assets/textures/placeholder/redstone_lamp.png`    |
| sand             | `assets/textures/placeholder/sand.png`             |
| stone            | `assets/textures/placeholder/stone.png`            |
| stone_bricks     | `assets/textures/placeholder/stone_bricks.png`     |
| white_wool       | `assets/textures/placeholder/white_wool.png`       |
