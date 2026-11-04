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

### Pixel Perfection Legacy (`pixel_perfection_legacy`)

- Authors: Nova_Wostra, Pixel Perfection Legacy contributors, Hugh "XSSheep" Rutland (original)
- License: [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) (ShareAlike)
- Source: https://modrinth.com/resourcepack/pixel-perfection-legacy/version/UT4foa3M
- Version: 26.3-97.2
- Modifications: Renamed; adapted/extended by Pixel Perfection Legacy contributors
- Attribution: "Pixel Perfection Legacy" (26.3-97.2) by Nova_Wostra, Pixel Perfection Legacy contributors, Hugh "XSSheep" Rutland (original), source: https://modrinth.com/resourcepack/pixel-perfection-legacy/version/UT4foa3M, licensed under CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changes: Renamed; adapted/extended by Pixel Perfection Legacy contributors.

| Texture                        | File                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------- |
| activator_rail                 | `assets/textures/pixel_perfection_legacy/activator_rail.png`                 |
| activator_rail_on              | `assets/textures/pixel_perfection_legacy/activator_rail_on.png`              |
| andesite                       | `assets/textures/pixel_perfection_legacy/andesite.png`                       |
| barrel_bottom                  | `assets/textures/pixel_perfection_legacy/barrel_bottom.png`                  |
| barrel_side                    | `assets/textures/pixel_perfection_legacy/barrel_side.png`                    |
| barrel_top                     | `assets/textures/pixel_perfection_legacy/barrel_top.png`                     |
| birch_door_bottom              | `assets/textures/pixel_perfection_legacy/birch_door_bottom.png`              |
| birch_leaves                   | `assets/textures/pixel_perfection_legacy/birch_leaves.png`                   |
| birch_planks                   | `assets/textures/pixel_perfection_legacy/birch_planks.png`                   |
| birch_trapdoor                 | `assets/textures/pixel_perfection_legacy/birch_trapdoor.png`                 |
| black_concrete                 | `assets/textures/pixel_perfection_legacy/black_concrete.png`                 |
| black_concrete_powder          | `assets/textures/pixel_perfection_legacy/black_concrete_powder.png`          |
| black_wool                     | `assets/textures/pixel_perfection_legacy/black_wool.png`                     |
| blue_concrete                  | `assets/textures/pixel_perfection_legacy/blue_concrete.png`                  |
| blue_concrete_powder           | `assets/textures/pixel_perfection_legacy/blue_concrete_powder.png`           |
| blue_wool                      | `assets/textures/pixel_perfection_legacy/blue_wool.png`                      |
| bricks                         | `assets/textures/pixel_perfection_legacy/bricks.png`                         |
| chiseled_stone_bricks          | `assets/textures/pixel_perfection_legacy/chiseled_stone_bricks.png`          |
| coarse_dirt                    | `assets/textures/pixel_perfection_legacy/coarse_dirt.png`                    |
| cobbled_deepslate              | `assets/textures/pixel_perfection_legacy/cobbled_deepslate.png`              |
| cobblestone                    | `assets/textures/pixel_perfection_legacy/cobblestone.png`                    |
| cracked_stone_bricks           | `assets/textures/pixel_perfection_legacy/cracked_stone_bricks.png`           |
| crafting_table_front           | `assets/textures/pixel_perfection_legacy/crafting_table_front.png`           |
| crafting_table_side            | `assets/textures/pixel_perfection_legacy/crafting_table_side.png`            |
| crafting_table_top             | `assets/textures/pixel_perfection_legacy/crafting_table_top.png`             |
| dark_oak_door_bottom           | `assets/textures/pixel_perfection_legacy/dark_oak_door_bottom.png`           |
| dark_oak_door_top              | `assets/textures/pixel_perfection_legacy/dark_oak_door_top.png`              |
| dark_oak_leaves                | `assets/textures/pixel_perfection_legacy/dark_oak_leaves.png`                |
| dark_oak_log                   | `assets/textures/pixel_perfection_legacy/dark_oak_log.png`                   |
| dark_oak_log_top               | `assets/textures/pixel_perfection_legacy/dark_oak_log_top.png`               |
| dark_oak_planks                | `assets/textures/pixel_perfection_legacy/dark_oak_planks.png`                |
| dark_oak_trapdoor              | `assets/textures/pixel_perfection_legacy/dark_oak_trapdoor.png`              |
| daylight_detector_inverted_top | `assets/textures/pixel_perfection_legacy/daylight_detector_inverted_top.png` |
| daylight_detector_side         | `assets/textures/pixel_perfection_legacy/daylight_detector_side.png`         |
| daylight_detector_top          | `assets/textures/pixel_perfection_legacy/daylight_detector_top.png`          |
| deepslate                      | `assets/textures/pixel_perfection_legacy/deepslate.png`                      |
| deepslate_bricks               | `assets/textures/pixel_perfection_legacy/deepslate_bricks.png`               |
| deepslate_tiles                | `assets/textures/pixel_perfection_legacy/deepslate_tiles.png`                |
| deepslate_top                  | `assets/textures/pixel_perfection_legacy/deepslate_top.png`                  |
| detector_rail                  | `assets/textures/pixel_perfection_legacy/detector_rail.png`                  |
| detector_rail_on               | `assets/textures/pixel_perfection_legacy/detector_rail_on.png`               |
| diorite                        | `assets/textures/pixel_perfection_legacy/diorite.png`                        |
| dirt                           | `assets/textures/pixel_perfection_legacy/dirt.png`                           |
| dispenser_front                | `assets/textures/pixel_perfection_legacy/dispenser_front.png`                |
| dropper_front                  | `assets/textures/pixel_perfection_legacy/dropper_front.png`                  |
| furnace_front                  | `assets/textures/pixel_perfection_legacy/furnace_front.png`                  |
| furnace_side                   | `assets/textures/pixel_perfection_legacy/furnace_side.png`                   |
| furnace_top                    | `assets/textures/pixel_perfection_legacy/furnace_top.png`                    |
| glass                          | `assets/textures/pixel_perfection_legacy/glass.png`                          |
| glass_pane_top                 | `assets/textures/pixel_perfection_legacy/glass_pane_top.png`                 |
| glowstone                      | `assets/textures/pixel_perfection_legacy/glowstone.png`                      |
| gold_block                     | `assets/textures/pixel_perfection_legacy/gold_block.png`                     |
| granite                        | `assets/textures/pixel_perfection_legacy/granite.png`                        |
| grass_block_side               | `assets/textures/pixel_perfection_legacy/grass_block_side.png`               |
| gray_concrete                  | `assets/textures/pixel_perfection_legacy/gray_concrete.png`                  |
| gray_concrete_powder           | `assets/textures/pixel_perfection_legacy/gray_concrete_powder.png`           |
| gray_wool                      | `assets/textures/pixel_perfection_legacy/gray_wool.png`                      |
| green_concrete                 | `assets/textures/pixel_perfection_legacy/green_concrete.png`                 |
| green_concrete_powder          | `assets/textures/pixel_perfection_legacy/green_concrete_powder.png`          |
| green_wool                     | `assets/textures/pixel_perfection_legacy/green_wool.png`                     |
| honey_block_bottom             | `assets/textures/pixel_perfection_legacy/honey_block_bottom.png`             |
| honey_block_side               | `assets/textures/pixel_perfection_legacy/honey_block_side.png`               |
| honey_block_top                | `assets/textures/pixel_perfection_legacy/honey_block_top.png`                |
| ice                            | `assets/textures/pixel_perfection_legacy/ice.png`                            |
| iron_block                     | `assets/textures/pixel_perfection_legacy/iron_block.png`                     |
| iron_door_bottom               | `assets/textures/pixel_perfection_legacy/iron_door_bottom.png`               |
| iron_door_top                  | `assets/textures/pixel_perfection_legacy/iron_door_top.png`                  |
| iron_trapdoor                  | `assets/textures/pixel_perfection_legacy/iron_trapdoor.png`                  |
| ladder                         | `assets/textures/pixel_perfection_legacy/ladder.png`                         |
| lantern                        | `assets/textures/pixel_perfection_legacy/lantern.png`                        |
| lava_flow                      | `assets/textures/pixel_perfection_legacy/lava_flow.png`                      |
| lava_still                     | `assets/textures/pixel_perfection_legacy/lava_still.png`                     |
| light_gray_concrete            | `assets/textures/pixel_perfection_legacy/light_gray_concrete.png`            |
| light_gray_concrete_powder     | `assets/textures/pixel_perfection_legacy/light_gray_concrete_powder.png`     |
| light_gray_wool                | `assets/textures/pixel_perfection_legacy/light_gray_wool.png`                |
| mossy_cobblestone              | `assets/textures/pixel_perfection_legacy/mossy_cobblestone.png`              |
| mossy_stone_bricks             | `assets/textures/pixel_perfection_legacy/mossy_stone_bricks.png`             |
| oak_door_bottom                | `assets/textures/pixel_perfection_legacy/oak_door_bottom.png`                |
| oak_door_top                   | `assets/textures/pixel_perfection_legacy/oak_door_top.png`                   |
| oak_planks                     | `assets/textures/pixel_perfection_legacy/oak_planks.png`                     |
| observer_back                  | `assets/textures/pixel_perfection_legacy/observer_back.png`                  |
| observer_front                 | `assets/textures/pixel_perfection_legacy/observer_front.png`                 |
| observer_side                  | `assets/textures/pixel_perfection_legacy/observer_side.png`                  |
| obsidian                       | `assets/textures/pixel_perfection_legacy/obsidian.png`                       |
| polished_andesite              | `assets/textures/pixel_perfection_legacy/polished_andesite.png`              |
| polished_deepslate             | `assets/textures/pixel_perfection_legacy/polished_deepslate.png`             |
| polished_diorite               | `assets/textures/pixel_perfection_legacy/polished_diorite.png`               |
| polished_granite               | `assets/textures/pixel_perfection_legacy/polished_granite.png`               |
| powered_rail                   | `assets/textures/pixel_perfection_legacy/powered_rail.png`                   |
| powered_rail_on                | `assets/textures/pixel_perfection_legacy/powered_rail_on.png`                |
| quartz_block_side              | `assets/textures/pixel_perfection_legacy/quartz_block_side.png`              |
| quartz_block_top               | `assets/textures/pixel_perfection_legacy/quartz_block_top.png`               |
| rail                           | `assets/textures/pixel_perfection_legacy/rail.png`                           |
| rail_corner                    | `assets/textures/pixel_perfection_legacy/rail_corner.png`                    |
| red_concrete                   | `assets/textures/pixel_perfection_legacy/red_concrete.png`                   |
| red_concrete_powder            | `assets/textures/pixel_perfection_legacy/red_concrete_powder.png`            |
| red_sand                       | `assets/textures/pixel_perfection_legacy/red_sand.png`                       |
| red_wool                       | `assets/textures/pixel_perfection_legacy/red_wool.png`                       |
| redstone_torch                 | `assets/textures/pixel_perfection_legacy/redstone_torch.png`                 |
| redstone_torch_off             | `assets/textures/pixel_perfection_legacy/redstone_torch_off.png`             |
| repeater_on                    | `assets/textures/pixel_perfection_legacy/repeater_on.png`                    |
| sandstone_top                  | `assets/textures/pixel_perfection_legacy/sandstone_top.png`                  |
| smooth_stone                   | `assets/textures/pixel_perfection_legacy/smooth_stone.png`                   |
| spruce_planks                  | `assets/textures/pixel_perfection_legacy/spruce_planks.png`                  |
| spruce_trapdoor                | `assets/textures/pixel_perfection_legacy/spruce_trapdoor.png`                |
| stone                          | `assets/textures/pixel_perfection_legacy/stone.png`                          |
| stone_bricks                   | `assets/textures/pixel_perfection_legacy/stone_bricks.png`                   |
| target_side                    | `assets/textures/pixel_perfection_legacy/target_side.png`                    |
| target_top                     | `assets/textures/pixel_perfection_legacy/target_top.png`                     |
| torch                          | `assets/textures/pixel_perfection_legacy/torch.png`                          |
| white_concrete                 | `assets/textures/pixel_perfection_legacy/white_concrete.png`                 |
| white_concrete_powder          | `assets/textures/pixel_perfection_legacy/white_concrete_powder.png`          |
| white_wool                     | `assets/textures/pixel_perfection_legacy/white_wool.png`                     |
| yellow_concrete                | `assets/textures/pixel_perfection_legacy/yellow_concrete.png`                |
| yellow_concrete_powder         | `assets/textures/pixel_perfection_legacy/yellow_concrete_powder.png`         |
| yellow_wool                    | `assets/textures/pixel_perfection_legacy/yellow_wool.png`                    |

### Pixel Perfection Legacy (`pixel_perfection_legacy`)

- Authors: Hugh "XSSheep" Rutland
- License: [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/) (ShareAlike)
- Source: https://modrinth.com/resourcepack/pixel-perfection-legacy/version/UT4foa3M
- Version: 26.3-97.2
- Modifications: Renamed
- Attribution: "Pixel Perfection Legacy" (26.3-97.2) by Hugh "XSSheep" Rutland, source: https://modrinth.com/resourcepack/pixel-perfection-legacy/version/UT4foa3M, licensed under CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changes: Renamed.

| Texture                           | File                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| birch_door_top                    | `assets/textures/pixel_perfection_legacy/birch_door_top.png`                    |
| birch_log                         | `assets/textures/pixel_perfection_legacy/birch_log.png`                         |
| birch_log_top                     | `assets/textures/pixel_perfection_legacy/birch_log_top.png`                     |
| black_stained_glass               | `assets/textures/pixel_perfection_legacy/black_stained_glass.png`               |
| black_stained_glass_pane_top      | `assets/textures/pixel_perfection_legacy/black_stained_glass_pane_top.png`      |
| black_terracotta                  | `assets/textures/pixel_perfection_legacy/black_terracotta.png`                  |
| blue_stained_glass                | `assets/textures/pixel_perfection_legacy/blue_stained_glass.png`                |
| blue_stained_glass_pane_top       | `assets/textures/pixel_perfection_legacy/blue_stained_glass_pane_top.png`       |
| blue_terracotta                   | `assets/textures/pixel_perfection_legacy/blue_terracotta.png`                   |
| bookshelf                         | `assets/textures/pixel_perfection_legacy/bookshelf.png`                         |
| chiseled_sandstone                | `assets/textures/pixel_perfection_legacy/chiseled_sandstone.png`                |
| clay                              | `assets/textures/pixel_perfection_legacy/clay.png`                              |
| comparator                        | `assets/textures/pixel_perfection_legacy/comparator.png`                        |
| comparator_on                     | `assets/textures/pixel_perfection_legacy/comparator_on.png`                     |
| cut_sandstone                     | `assets/textures/pixel_perfection_legacy/cut_sandstone.png`                     |
| diamond_block                     | `assets/textures/pixel_perfection_legacy/diamond_block.png`                     |
| grass_block_top                   | `assets/textures/pixel_perfection_legacy/grass_block_top.png`                   |
| gravel                            | `assets/textures/pixel_perfection_legacy/gravel.png`                            |
| gray_terracotta                   | `assets/textures/pixel_perfection_legacy/gray_terracotta.png`                   |
| green_terracotta                  | `assets/textures/pixel_perfection_legacy/green_terracotta.png`                  |
| hopper_inside                     | `assets/textures/pixel_perfection_legacy/hopper_inside.png`                     |
| hopper_outside                    | `assets/textures/pixel_perfection_legacy/hopper_outside.png`                    |
| hopper_top                        | `assets/textures/pixel_perfection_legacy/hopper_top.png`                        |
| iron_bars                         | `assets/textures/pixel_perfection_legacy/iron_bars.png`                         |
| lever                             | `assets/textures/pixel_perfection_legacy/lever.png`                             |
| light_blue_stained_glass          | `assets/textures/pixel_perfection_legacy/light_blue_stained_glass.png`          |
| light_blue_stained_glass_pane_top | `assets/textures/pixel_perfection_legacy/light_blue_stained_glass_pane_top.png` |
| light_gray_terracotta             | `assets/textures/pixel_perfection_legacy/light_gray_terracotta.png`             |
| note_block                        | `assets/textures/pixel_perfection_legacy/note_block.png`                        |
| oak_leaves                        | `assets/textures/pixel_perfection_legacy/oak_leaves.png`                        |
| oak_log                           | `assets/textures/pixel_perfection_legacy/oak_log.png`                           |
| oak_log_top                       | `assets/textures/pixel_perfection_legacy/oak_log_top.png`                       |
| oak_trapdoor                      | `assets/textures/pixel_perfection_legacy/oak_trapdoor.png`                      |
| observer_top                      | `assets/textures/pixel_perfection_legacy/observer_top.png`                      |
| piston_bottom                     | `assets/textures/pixel_perfection_legacy/piston_bottom.png`                     |
| piston_inner                      | `assets/textures/pixel_perfection_legacy/piston_inner.png`                      |
| piston_side                       | `assets/textures/pixel_perfection_legacy/piston_side.png`                       |
| piston_top                        | `assets/textures/pixel_perfection_legacy/piston_top.png`                        |
| piston_top_sticky                 | `assets/textures/pixel_perfection_legacy/piston_top_sticky.png`                 |
| red_stained_glass                 | `assets/textures/pixel_perfection_legacy/red_stained_glass.png`                 |
| red_stained_glass_pane_top        | `assets/textures/pixel_perfection_legacy/red_stained_glass_pane_top.png`        |
| red_terracotta                    | `assets/textures/pixel_perfection_legacy/red_terracotta.png`                    |
| redstone_block                    | `assets/textures/pixel_perfection_legacy/redstone_block.png`                    |
| redstone_dust                     | `assets/textures/pixel_perfection_legacy/redstone_dust.png`                     |
| redstone_dust_line0               | `assets/textures/pixel_perfection_legacy/redstone_dust_line0.png`               |
| redstone_dust_line1               | `assets/textures/pixel_perfection_legacy/redstone_dust_line1.png`               |
| redstone_lamp                     | `assets/textures/pixel_perfection_legacy/redstone_lamp.png`                     |
| repeater                          | `assets/textures/pixel_perfection_legacy/repeater.png`                          |
| sand                              | `assets/textures/pixel_perfection_legacy/sand.png`                              |
| sandstone                         | `assets/textures/pixel_perfection_legacy/sandstone.png`                         |
| sandstone_bottom                  | `assets/textures/pixel_perfection_legacy/sandstone_bottom.png`                  |
| sea_lantern                       | `assets/textures/pixel_perfection_legacy/sea_lantern.png`                       |
| slime_block                       | `assets/textures/pixel_perfection_legacy/slime_block.png`                       |
| smooth_stone_slab_side            | `assets/textures/pixel_perfection_legacy/smooth_stone_slab_side.png`            |
| snow                              | `assets/textures/pixel_perfection_legacy/snow.png`                              |
| spruce_door_bottom                | `assets/textures/pixel_perfection_legacy/spruce_door_bottom.png`                |
| spruce_door_top                   | `assets/textures/pixel_perfection_legacy/spruce_door_top.png`                   |
| spruce_leaves                     | `assets/textures/pixel_perfection_legacy/spruce_leaves.png`                     |
| spruce_log                        | `assets/textures/pixel_perfection_legacy/spruce_log.png`                        |
| spruce_log_top                    | `assets/textures/pixel_perfection_legacy/spruce_log_top.png`                    |
| terracotta                        | `assets/textures/pixel_perfection_legacy/terracotta.png`                        |
| tnt_bottom                        | `assets/textures/pixel_perfection_legacy/tnt_bottom.png`                        |
| tnt_side                          | `assets/textures/pixel_perfection_legacy/tnt_side.png`                          |
| tnt_top                           | `assets/textures/pixel_perfection_legacy/tnt_top.png`                           |
| water_flow                        | `assets/textures/pixel_perfection_legacy/water_flow.png`                        |
| water_still                       | `assets/textures/pixel_perfection_legacy/water_still.png`                       |
| white_stained_glass               | `assets/textures/pixel_perfection_legacy/white_stained_glass.png`               |
| white_stained_glass_pane_top      | `assets/textures/pixel_perfection_legacy/white_stained_glass_pane_top.png`      |
| white_terracotta                  | `assets/textures/pixel_perfection_legacy/white_terracotta.png`                  |
| yellow_terracotta                 | `assets/textures/pixel_perfection_legacy/yellow_terracotta.png`                 |

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
