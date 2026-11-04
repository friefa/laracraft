# Bedrock vs. Java: Gameplay rules that affect build guides (B0)

Target: Bedrock Edition **26.60** (released 2026-10-27) compared with Java Edition **26.3** (our registry).
Every rule has a source and a status:

- **verified**: stated by minecraft.wiki (block page, parity list or changelog copy) or an official changelog,
  ideally confirmed by a second source.
- **assumed**: one weak source, our own reasoning, or the source does not cover the current version. Must be
  checked in-game before `build-order` depends on it (ADR-0006, point 7).

"Engine impact" says what `EditionProfile` (package B2) should do with the rule. Short source keys are listed
at the end of the file.

## 1. Player geometry and reach

| #   | Rule                                                                                              | Java 26.3                              | Bedrock 26.60                                                                                                                                                       | Status          | Source                           |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------- |
| 1.1 | Block interaction range in survival                                                               | 4.5 blocks (`block_interaction_range`) | **5 blocks** with keyboard/mouse or controller                                                                                                                      | verified        | [IR]                             |
| 1.2 | Block interaction range with **touch** input, survival                                            | n/a                                    | **6 blocks** (Creative: 12)                                                                                                                                         | verified        | [IR]                             |
| 1.3 | Where reach is measured from (eye vs. camera) and to (block centre vs. nearest point of the face) | eye position to hit point              | not documented                                                                                                                                                      | open            | -                                |
| 1.4 | Eye height standing                                                                               | 1.62                                   | 1.62 assumed (no Bedrock-specific number found)                                                                                                                     | assumed         | [Player]                         |
| 1.5 | Sneaking lowers the eye by 0.35 and the hitbox to 1.5 blocks                                      | yes                                    | hitbox 1.5 since 1.20.10 (1.19.70 preview); eye drop "camera lowered", amount not documented; MCPE-166446: the _logical_ eye position does not change when sneaking | partly verified | [Sneak], [Player], [MCPE-166446] |
| 1.6 | Jump height (pillar jumping / "towering" needs > 1 block)                                         | 1.2522                                 | 1.24919                                                                                                                                                             | verified        | [Player]                         |

**Engine impact.** `EditionProfile.reach`: Java 4.5, Bedrock 5.0 (use 5.0 for all Bedrock inputs; touch players get
6, so 5 is the safe common value). `JUMP_HEIGHT` 1.25 stays valid for both (towering still works). Keep eye height
1.62 for both and list 1.3/1.4 as open questions in code.

## 2. Edges, bridging and placing next to / under yourself

| #   | Rule                                                                                                                                                                                                                                                                                                                                  | Status                                          | Source                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| 2.1 | **Bedrock-only "simple bridging"**: a player standing on a block can place a block _in front of_ that block by looking at the empty position (no face needs to be clicked), as long as it is adjacent to the block they stand on. Works without sneaking. Java must click an existing face (usually sneak to the edge and look back). | verified                                        | [Parity] (general, BE-only), [Sneak] (trivia), [Bridging] |
| 2.2 | Bedrock: blocks can be placed continuously while holding the button; placing speed matches movement speed.                                                                                                                                                                                                                            | verified                                        | [Parity]                                                  |
| 2.3 | Sneaking stops the player at edges in both editions. Java additionally prevents falling while up to 0.6 above ground (`step_height`); the wiki marks that detail Java-only.                                                                                                                                                           | verified                                        | [Sneak]                                                   |
| 2.4 | Placing a block under yourself while jumping (towering) works in both editions (jump height > 1, see 1.6).                                                                                                                                                                                                                            | assumed (follows from 1.6 and normal placement) | [Player]                                                  |
| 2.5 | Bedrock trapdoors have "snappable placement" since 26.60 (direction locks while the place control is held).                                                                                                                                                                                                                           | verified                                        | [BE26.60]                                                 |

**Engine impact.** In Bedrock a scaffold step "place next to the block I stand on" is always possible without a
clickable neighbour face (rule 2.1). The planner may use it to extend bridges; the Java profile must not. The
reach check still applies.

## 3. Placing against interactive blocks

| #   | Rule                                                                                                                                                                                                                                                                                             | Status          | Source                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------- |
| 3.1 | Both editions: sneak + use places the held block on chests, furnaces, hoppers, etc. instead of opening them.                                                                                                                                                                                     | verified        | [Sneak]                    |
| 3.2 | Bedrock: with "toggle sneak" on controller/touch, sneaking survives opening a UI; while flying downward the player is in sneak stance and can place on utility blocks.                                                                                                                           | verified        | [Sneak]                    |
| 3.3 | Java-only: placing a chest next to another chest with sneak keeps them separate ("connects only to the clicked block"); Bedrock chests pair through the block entity (`pairx`/`pairz`) and the Java sneak rule is listed as Java-only. How to reliably avoid pairing in Bedrock: not documented. | partly verified | [Parity], [BE-BlockEntity] |

**Engine impact.** Keep "sneak to place" hints for both. For adjacent single chests in Bedrock add a warning (open
question), or rotate one chest.

## 4. Orientation on placement

| #    | Block                                                            | Java 26.3 (our `PlacementSource`)                                     | Bedrock 26.60                                                                                                                                                                                                                                    | Status                                              | Source                 |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------- |
| 4.1  | Stairs                                                           | `facing` = look direction, `half` = clicked half                      | same rule; Bedrock now also stores `minecraft:corner` (26.50)                                                                                                                                                                                    | assumed same                                        | [Stairs], [BE26.50]    |
| 4.2  | Logs / deepslate (`axis`)                                        | clicked face axis                                                     | `pillar_axis`, same rule                                                                                                                                                                                                                         | assumed same                                        | j2b                    |
| 4.3  | Piston, sticky piston, dispenser, dropper, observer, barrel (3D) | nearest look direction incl. pitch (`playerLook3d(Opposite)`)         | "placed facing toward the player"; up/down chosen from the player's **position/elevation** relative to the block (old Java logic), MCPE-19723 reports pistons/droppers/observers facing depending on player coordinates when the player is above | assumed (bug report title only, page not reachable) | [Piston], [MCPE-19723] |
| 4.4  | Trapdoor                                                         | side click: facing = clicked face; top/bottom click: facing from look | same, plus snappable placement (26.60)                                                                                                                                                                                                           | assumed same                                        | [Trapdoor], [BE26.60]  |
| 4.5  | Buttons on floor/ceiling                                         | have a `facing` (4 rotations)                                         | **no rotation** (facing_direction 0/1 only)                                                                                                                                                                                                      | verified                                            | [Button], [Parity]     |
| 4.6  | Lever on floor/ceiling                                           | 4 rotations                                                           | only the axis (`up_north_south` / `up_east_west`), handle direction fixed                                                                                                                                                                        | verified                                            | [Lever]                |
| 4.7  | Torches                                                          | top and sides of sturdy faces                                         | top and sides (`torch_facing_direction`), never bottom                                                                                                                                                                                           | verified                                            | [Torch]                |
| 4.8  | Lantern                                                          | standing / hanging from clicked face                                  | same `hanging` state; wiki also allows clicking the side of a neighbour (top half hangs)                                                                                                                                                         | assumed same                                        | [Lantern]              |
| 4.9  | Lone rails                                                       | along the player's look direction                                     | listed as Java-only in the parity list (Bedrock lone rails do not follow the look direction)                                                                                                                                                     | verified (parity list)                              | [Parity] (MCPE-52823)  |
| 4.10 | Chests                                                           | front faces the player; joins chests with the same facing             | front faces the player; pairing see 3.3                                                                                                                                                                                                          | partly verified                                     | [Chest], [Parity]      |

**Engine impact.** The block-state tables are in `block-mapping.json`; placement rules only differ for 4.3 (needs
verification before Bedrock redstone modules rely on vertical pistons/observers), 4.5/4.6 (Bedrock cannot reproduce
some Java states: editor warning) and 4.9.

## 5. Support: what can be placed on what

All entries below are differences; everything else follows the same rules as Java (sturdy face / centre support).

| #    | Surface                             | Java 26.3                                                                    | Bedrock 26.60                                                                  | Status                                                  | Source                         |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------ |
| 5.1  | Glass (block)                       | torches/buttons/levers on top and sides                                      | same (torch on glass side is "Works as Intended" since 0.15.90)                | verified                                                | [MCPE-17487], [Placement]      |
| 5.2  | Glass pane, iron bars (top)         | torches, pressure plates, lanterns (top **and bottom**)                      | **not supported**                                                              | verified                                                | [Parity], [Torch]              |
| 5.3  | Fence gate (top)                    | torches, redstone torches, lanterns, candles, pressure plates                | **not supported**                                                              | verified                                                | [Parity] (MC-148901), [Torch]  |
| 5.4  | Fence / wall (top)                  | torches, lanterns, pressure plates, carpets                                  | same **plus** levers, buttons(?), repeaters and comparators                    | verified for lever/repeater/comparator, buttons assumed | [Lever], [Repeater], [Parity]  |
| 5.5  | Hopper (top)                        | rails, dust, repeaters, comparators, pressure plates                         | additionally buttons, levers and redstone torches                              | verified                                                | [Parity] (MC-122352), [RTorch] |
| 5.6  | Stairs (back / sides)               | torches, buttons, levers on the full back face (support depends on the face) | not on stair backs ("torch placement depends on solid face" is Java-only)      | verified                                                | [Parity] (MCPE-137520)         |
| 5.7  | Honey block (sides)                 | nothing (Java 26.4 will allow it)                                            | torches, levers, buttons, ladders, rails, bells on the sides                   | verified                                                | [Parity] (MC-163196)           |
| 5.8  | Piston (sides)                      | most attached blocks pop off when the piston extends; safe only on the back  | attached blocks survive on back **and** sides                                  | verified                                                | [Piston]                       |
| 5.9  | Leaves                              | nothing attaches (empty support shape)                                       | not documented for torches/buttons; parity list has no entry                   | open                                                    | [Placement]                    |
| 5.10 | Lever / button / carpet under water | pop off                                                                      | buttons and pressure plates can be waterlogged; levers soon (26.70 "upcoming") | verified                                                | [Waterlogging]                 |

Our registry comment in `libs/core-model/src/lib/registry/data/glass.ts` says "Bedrock differs" for torches on glass;
per 5.1 that is outdated (only panes differ).

**Engine impact.** `EditionProfile.support` overrides: panes/iron bars/fence gates give `none` on top in Bedrock;
walls/fences give `rigid` for repeaters/comparators and `center` for levers in Bedrock; stair sides are never
`full` in Bedrock (we already treat them as `none`); piston sides become valid anchors in Bedrock.

## 6. Gravity blocks

| #   | Rule                                                                                            | Status   | Source                   |
| --- | ----------------------------------------------------------------------------------------------- | -------- | ------------------------ |
| 6.1 | Sand, red sand, gravel, concrete powder fall in both editions; torches below stop them in both. | verified | [Torch], [FallingBlock]  |
| 6.2 | Snow **layers** fall in Bedrock (not in Java); not in our registry.                             | verified | [FallingBlock], [Parity] |
| 6.3 | Java: falling blocks drop as items after 30 s; Bedrock: only in cobwebs.                        | verified | [Parity]                 |

**Engine impact.** None for the current registry.

## 7. Fluids and waterlogging

| #   | Rule                                                                                                                                                                                                                                                                     | Status       | Source                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------- |
| 7.1 | Bedrock stores water in a second **block layer**; any block can technically hold water, generally all non-cube blocks can be waterlogged. Java uses the `waterlogged` property on specific blocks.                                                                       | verified     | [Waterlogging]                   |
| 7.2 | Bedrock: non-cube blocks **cannot displace water sources** (no air pockets with doors etc.); they only displace flowing water.                                                                                                                                           | verified     | [Waterlogging]                   |
| 7.3 | Waterloggable only in Bedrock (from our registry): doors, fence gates, buttons, carpets, pressure plates, hoppers, daylight detectors, pistons. Torches and redstone dust/torches cannot be placed in water in either edition ("placement completely fails" in Bedrock). | verified     | [Waterlogging]                   |
| 7.4 | Waterlogged leaves spread water in Bedrock (not in Java).                                                                                                                                                                                                                | verified     | [Parity] (MCPE-153400), [Leaves] |
| 7.5 | Waterlogged trapdoors release water from all sides except the top in Bedrock (Java: also not through the closed side).                                                                                                                                                   | verified     | [Trapdoor]                       |
| 7.6 | Rails are destroyed by flowing water in Bedrock; buttons/levers are not destroyed by water or lava in Bedrock.                                                                                                                                                           | verified     | [Parity], [Waterlogging]         |
| 7.7 | Java-only: a waterloggable block placed between two water sources becomes waterlogged.                                                                                                                                                                                   | verified     | [Parity] (MC-130203)             |
| 7.8 | Waterlogged ladders cannot be climbed in Bedrock.                                                                                                                                                                                                                        | verified     | [Ladder]                         |
| 7.9 | Flow distance, infinite water source rule and lava speeds: no documented difference.                                                                                                                                                                                     | assumed same | [Water], [Lava]                  |

**Engine impact.** Planner: in Bedrock place water **after** the non-cube blocks it should share a space with is
not enough to get an air pocket (7.2); the guide must warn. Rail lines near flowing water: Bedrock-only warning.

## 8. Redstone

| #    | Rule                                                                                                                                                                                                                                                                                                           | Status       | Source                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| 8.1  | **No quasi-connectivity** in Bedrock (pistons, sticky pistons, dispensers, droppers). QC is Java (and Legacy Console) only.                                                                                                                                                                                    | verified     | [QC], [Parity] (MCPE-14664 WAI) |
| 8.2  | Bedrock pistons check power **every tick**: a powered piston extends as soon as it can, no BUD behaviour.                                                                                                                                                                                                      | verified     | [Parity]                        |
| 8.3  | Piston start delay: Java 0 or 1 game tick depending on the phase; Bedrock fixed **2 game ticks**, only on consumer ticks (C-ticks). Bedrock pistons finish extending before retracting and need 1 tick to retract.                                                                                             | verified     | [Piston], [Parity]              |
| 8.4  | Sticky piston with a 1-tick pulse: Java spits the block out (leaves it), Bedrock pulls it back. Both "working as intended".                                                                                                                                                                                    | verified     | [Parity]                        |
| 8.5  | Bedrock pistons can move most block entities (chests, furnaces, hoppers, ...); Java cannot. Bedrock pistons break banners/signs instead of being blocked.                                                                                                                                                      | verified     | [Parity]                        |
| 8.6  | Slime/honey: both stick to neighbours, do not stick to each other, 12-block limit in both. Bedrock honey **conducts redstone** (not transparent); entities ride any moving block in Bedrock.                                                                                                                   | verified     | [Piston], [Parity] (MCPE-59451) |
| 8.7  | **Soft inversion** (Bedrock): a redstone torch attached to a piston turns off while the piston is powered.                                                                                                                                                                                                     | verified     | [Piston], [RTorch] (MCPE-17909) |
| 8.8  | Observers: Java detects shape updates of the watched block; Bedrock acts as a **block update detector** (detects anything that causes a block update) and only on odd game ticks (P-ticks). Neither pulses on its own placement (Bedrock since 1.16.0). A moved observer always pulses immediately in Bedrock. | verified     | [Observer]                      |
| 8.9  | Redstone dust: Bedrock dust **cannot be a dot** (an unconnected wire is always a cross, powering all 4 sides); it auto-points at piston backs/sides; power can go **down** through transparent blocks (glass); transmission order is random. 26.60 added connection block states.                              | verified     | [Dust], [Parity], [BE26.60]     |
| 8.10 | Repeaters/comparators: can stand on fences/walls in Bedrock. Repeater `locked` state only arrives in Bedrock 26.70 (upcoming). Java comparators accept side input from redstone blocks and output 15 through a strongly powered block; listed as Java-only.                                                    | verified     | [Repeater], [Parity]            |
| 8.11 | Redstone torch: Bedrock torches turn off with a 1-tick pulse; burnout rules differ (Bedrock torch only burns out when it powers itself with no delay).                                                                                                                                                         | verified     | [RTorch], [Parity]              |
| 8.12 | TNT next to power ignites on placement in both editions; no documented difference for placement.                                                                                                                                                                                                               | assumed same | [Parity]                        |
| 8.13 | Note block note changes do not cause a block update in Bedrock: observers/BUDs cannot detect retuning.                                                                                                                                                                                                         | verified     | [Parity] (MCPE-53919)           |
| 8.14 | Bedrock 26.50 bug list: "[Experimental] The new single wool slabs and stairs conduct redstone" (MCPE-240018). Status in 26.60 unknown.                                                                                                                                                                         | open         | [BE26.50]                       |

**Engine impact (build order).**

- Java QC circuits (piston walls powered from above, BUD pistons) do not work in Bedrock: mark such modules
  `java-only` (ADR-0006, point 4).
- Bedrock observers fire on _neighbour_ updates of the watched block, so placing any block next to the watched
  position can fire them. The Bedrock profile should place observers **last** in their neighbourhood (after all
  six neighbours of the watched block), stricter than Java.
- Dust "dot" states: Bedrock powers all four sides; components next to an isolated dust spot get powered in Bedrock.
- Pistons in Bedrock react to power immediately (8.2): the "place piston, then power" order matters the same way,
  but there are no BUD-safe placements.
- Soft inversion: placing a redstone torch on a piston that is powered turns it off in Bedrock only.

## 9. Other things that change whether a survival build order works

| #   | Rule                                                                                                                                             | Status   | Source         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- |
| 9.1 | Leaves decay distance: Java 6, Bedrock 4 blocks from logs (only matters for non-persistent leaves; player-placed leaves are persistent in both). | verified | [Leaves]       |
| 9.2 | Slabs: in Bedrock single slabs let light through (transparent), double slabs are opaque. Affects mob spawning, not placement.                    | verified | [Slab]         |
| 9.3 | Bedrock world layers allow two slabs/blocks in one position only via editing, not in survival.                                                   | verified | [Waterlogging] |
| 9.4 | Stair corner and fence/pane connection states send neighbour updates in Bedrock only in worlds created on 1.26.40+/1.26.50+.                     | verified | [BE26.50]      |

## Sources

| Key              | URL                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------- |
| [IR]             | https://minecraft.wiki/w/Interaction_range                                                    |
| [Player]         | https://minecraft.wiki/w/Player                                                               |
| [Sneak]          | https://minecraft.wiki/w/Sneaking                                                             |
| [Bridging]       | https://minecraft.wiki/w/Tutorial:Bridging                                                    |
| [Parity]         | https://minecraft.wiki/w/Parity_issue_list                                                    |
| [Placement]      | https://minecraft.wiki/w/Opacity/Placement (Java-centric, marked "cleanup: Bedrock")          |
| [Torch]          | https://minecraft.wiki/w/Torch                                                                |
| [Lantern]        | https://minecraft.wiki/w/Lantern                                                              |
| [Lever]          | https://minecraft.wiki/w/Lever                                                                |
| [Button]         | https://minecraft.wiki/w/Button                                                               |
| [Stairs]         | https://minecraft.wiki/w/Stairs                                                               |
| [Slab]           | https://minecraft.wiki/w/Slab                                                                 |
| [Trapdoor]       | https://minecraft.wiki/w/Trapdoor                                                             |
| [Chest]          | https://minecraft.wiki/w/Chest                                                                |
| [Ladder]         | https://minecraft.wiki/w/Ladder                                                               |
| [Leaves]         | https://minecraft.wiki/w/Leaves                                                               |
| [Piston]         | https://minecraft.wiki/w/Piston                                                               |
| [QC]             | https://minecraft.wiki/w/Tutorial:Quasi-connectivity                                          |
| [Observer]       | https://minecraft.wiki/w/Observer                                                             |
| [Dust]           | https://minecraft.wiki/w/Redstone_Dust                                                        |
| [Repeater]       | https://minecraft.wiki/w/Redstone_Repeater                                                    |
| [RTorch]         | https://minecraft.wiki/w/Redstone_Torch                                                       |
| [Waterlogging]   | https://minecraft.wiki/w/Waterlogging                                                         |
| [Water]          | https://minecraft.wiki/w/Water                                                                |
| [Lava]           | https://minecraft.wiki/w/Lava                                                                 |
| [FallingBlock]   | https://minecraft.wiki/w/Falling_Block                                                        |
| [BE-BlockEntity] | https://minecraft.wiki/w/Bedrock_Edition_level_format/Block_entity_format                     |
| [BE26.50]        | https://minecraft.wiki/w/Bedrock_Edition_26.50 (copy of the official changelog)               |
| [BE26.60]        | https://minecraft.wiki/w/Bedrock_Edition_26.60 (copy of the official changelog)               |
| [MCPE-17487]     | https://bugs-legacy.mojang.com/browse/MCPE-17487 (torch on glass side, WAI)                   |
| [MCPE-19723]     | https://bugs-legacy.mojang.com/browse/MCPE-19723 (piston/observer facing vs. player position) |
| [MCPE-166446]    | https://bugs.mojang.com/browse/MCPE-166446 (eye position not changing when sneaking)          |
