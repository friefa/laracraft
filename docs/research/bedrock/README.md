# B0 – Bedrock Edition differences (research)

Research package B0 for [ADR-0006](../../adr/0006-bedrock-edition.md) (Bedrock as second target edition, Java
blockstates stay the internal model). Docs only; nothing here is shipped code.

| File                                                                 | Content                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`block-mapping.json`](block-mapping.json)                           | Java → Bedrock id/state mapping for **all 234 registry blocks** (input for B1)        |
| [`rules.md`](rules.md)                                               | Gameplay differences that change a survival build order (input for B2/B4)             |
| [`formats.md`](formats.md)                                           | `.mcstructure` format and converter practice (input for B5)                           |
| [`scripts/list-registry-blocks.ts`](scripts/list-registry-blocks.ts) | Dumps the registry (ids + properties) as JSON                                         |
| [`scripts/derive-mapping.py`](scripts/derive-mapping.py)             | Builds `block-mapping.json` from the registry dump, community data and `curated.json` |
| [`scripts/curated.json`](scripts/curated.json)                       | Hand-written notes, overrides, families and source list                               |

**Verified** = stated by minecraft.wiki (block pages, parity list, copies of the official changelogs) or by the
machine-readable community data, ideally both. **Assumed** = single weak source or our own reasoning; must be
checked in-game before code depends on it. No game files were downloaded.

## Versions (verified)

- **Bedrock 26.60** is the current release (2026-10-27); **26.70** is in preview (26.70.23).
  [Bedrock Edition](https://minecraft.wiki/w/Bedrock_Edition), [26.60](https://minecraft.wiki/w/Bedrock_Edition_26.60)
- Bedrock switched from `1.21.x` to year-based `26.x` with 26.0; internally the versions are still `1.26.x`
  (26.60 = 1.26.60). [Version history](https://minecraft.wiki/w/Bedrock_Edition_version_history)
- The numbering is **not** shared with Java: Java has 26.1/26.2/26.3, Bedrock 26.0/26.10/…/26.60. Content parity
  for our registry: **Java 26.3 ↔ Bedrock 26.50** (both released 2026-09-15; wool/concrete stairs and slabs).
  [26.50](https://minecraft.wiki/w/Bedrock_Edition_26.50), [Wool Stairs](https://minecraft.wiki/w/Wool_Stairs),
  [Concrete Stairs](https://minecraft.wiki/w/Concrete_Stairs)
- Block-state version stored in Bedrock palettes: `18168865` (`0x01153C21`, 1.21.60.33) for 26.30–26.60.

## Summary and confidence per section

| Section                                 | Confidence                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block ids and states (226/234 verified) | **High.** Derived mechanically from the 26.30 J2B table, cross-checked against the 26.60 permutation list (every state name/value exists in 26.60, no unexplained states left) and the wiki block-state tables. 8 blocks `assumed`: doors (90° offset conflict), barrel (wiki table contradicts data), hopper (`toggle_bit` inverted vs. J2B), redstone wire (name of the 26.60 connection states). |
| Reach, eye height, bridging             | **Medium.** Reach numbers verified ([Interaction range](https://minecraft.wiki/w/Interaction_range)); Bedrock eye height and reach measuring point not documented.                                                                                                                                                                                                                                  |
| Placement orientation                   | **Medium.** Differences for buttons/levers verified; 3D facing of pistons/observers in Bedrock only backed by a bug-report title.                                                                                                                                                                                                                                                                   |
| Support rules                           | **Medium-high.** Parity list entries are explicit; the wiki placement table is Java-centric; leaves unknown.                                                                                                                                                                                                                                                                                        |
| Fluids / waterlogging                   | **High** for waterlogging (dedicated wiki page with a JE/BE table); flow mechanics assumed identical.                                                                                                                                                                                                                                                                                               |
| Redstone                                | **High** for the well-known differences (QC, piston timing, observers, dust, soft inversion) – wiki pages + parity list agree.                                                                                                                                                                                                                                                                      |
| `.mcstructure`                          | **High** for v1 (two community references agree); **medium** for v2/compression (changelog copy only, tag details missing).                                                                                                                                                                                                                                                                         |

### Top differences that affect our engine

1. **No quasi-connectivity** in Bedrock; pistons check power every tick, start delay fixed 2 game ticks, sticky
   pistons do not drop blocks on 1-tick pulses → redstone modules need per-edition compatibility. ([rules §8](rules.md#8-redstone))
2. **Reach 5 blocks** (touch 6) instead of 4.5. ([rules §1](rules.md#1-player-geometry-and-reach))
3. **Simple bridging**: Bedrock can place a block in front of the block the player stands on without a clickable
   face. ([rules §2](rules.md#2-edges-bridging-and-placing-next-to--under-yourself))
4. **Observers are block-update detectors** in Bedrock (fire on neighbour updates of the watched block, P-ticks only)
   → stricter "place observer last" rule.
5. **Support differences**: no torches/lanterns/pressure plates on glass panes, iron bars, fence gates; levers,
   repeaters, comparators on fences/walls; buttons/levers/redstone torches on hoppers; attachments survive on piston
   sides; nothing on stair backs. ([rules §5](rules.md#5-support-what-can-be-placed-on-what))
6. **Waterlogging is a block layer**: more blocks waterloggable, sources cannot be displaced (no air pockets with
   doors), waterlogged leaves spread water, rails break in flowing water. ([rules §7](rules.md#7-fluids-and-waterlogging))
7. **Lossy states**: floor/ceiling buttons have no rotation, floor/ceiling lever handle direction, leaves
   `distance`, `cave_air`/`void_air`, piston head `short`, note block (pitch in block entity). 14 blocks are `lossy`.
8. **Renamed ids**: 22 registry blocks have a different Bedrock id, including traps like Java `stone_stairs` →
   `normal_stone_stairs` while Java `cobblestone_stairs` → Bedrock `stone_stairs`; slabs use separate
   `*_double_slab` ids; lit/powered variants are separate ids (lit_furnace, unlit_redstone_torch,
   powered_repeater, …).
9. **Redstone dust**: no dot state (isolated dust powers all sides), auto-connects to pistons, passes power down
   through glass.
10. **Recent Bedrock alignments with Java**: 26.50 added `minecraft:corner` for stairs and `minecraft:connection_*`
    for fences/panes/iron bars; 26.60 added dust connection states and `.mcstructure` v2 compression; repeater
    `locked` follows in 26.70. Door/fence gate/chest/furnace/repeater/comparator already use
    `minecraft:cardinal_direction` (doors since 1.21.60, per the wiki history); trapdoors, buttons, pistons, dispensers, hoppers, ladders, barrels still use int states.

## `block-mapping.json` schema

Generated by `scripts/derive-mapping.py`; regenerate rather than hand-edit (put notes/overrides into
`scripts/curated.json`). Shape, as a TypeScript sketch for B1:

```ts
interface BlockMappingFile {
  schemaVersion: 1;
  java: { version: string; blockCount: number }; // "26.3", 234
  bedrock: {
    version: string; // "26.60"
    blockStateVersion: number[]; // [18168865] – value for palette `version`
    directionEnums: Record<string, { values: unknown; note: string; refs?: string[] }>;
  };
  sources: Record<string, string>; // key → URL (+ comment)
  propertyKinds: Record<JavaOnlyKind, string>;
  blocks: Record<JavaBlockId, BlockMapping>;
}

type BedrockType = 'byte' | 'int' | 'string'; // NBT tag type in .mcstructure; byte = 0/1 booleans
type JavaOnlyKind = 'waterLayer' | 'derived' | 'blockEntity' | 'lost';

interface BlockMapping {
  status: 'same' | 'differs' | 'lossy' | 'unavailable';
  bedrock: string | null; // Bedrock id of the Java default state (null if unavailable)
  /** Present when a Java property selects a different Bedrock id (slab type=double, lit, powered, level …). */
  identifierBy?: { properties: string[]; table: { when: Record<string, string>; id: string }[] };
  /** One entry per Bedrock state that must be written. */
  states?: Record<
    string,
    {
      type: BedrockType;
      javaProperties: string[]; // [] = constant
      constant?: number | string; // when javaProperties is []
      values?: Record<string, number | string>; // single Java property: java value → bedrock value
      table?: { when: Record<string, string>; value: number | string }[]; // several Java properties
      since?: string; // Bedrock version that added the state (newer than the J2B data)
      note?: string;
      override?: string; // reason why we deviate from the J2B data
    }
  >;
  /** Java properties without a Bedrock state, and what to do with them. */
  javaOnlyProperties?: Record<string, { kind: JavaOnlyKind | 'unknown'; note?: string }>;
  unmappedBedrockStates?: Record<string, { type: BedrockType; values: unknown[] }>; // should stay empty
  javaPropertyMismatch?: { registry: string[]; j2b: string[] }; // should stay empty
  source: string; // "j2b-1.26.30" or "template:<java id>"
  family?: string; // stairs, slab, fence, …
  notes?: string[];
  refs?: string[]; // keys into `sources`
  confidence: 'verified' | 'assumed';
}
```

Status meaning: `same` = identical id, state names and values; `differs` = fully representable but renamed
ids/states/values; `lossy` = some Java information has no Bedrock equivalent; `unavailable` = no Bedrock block
(none today). Booleans are emitted as `0/1` with `type: "byte"` because that is how they are stored in NBT.

How to apply it (B1): pick the id from `identifierBy` (else `bedrock`), write every `states` entry from the Java
state (`values`/`table`/`constant`), add `minecraft:water` in layer 1 when `waterlogged=true`, move
`blockEntity` properties into `block_entity_data`, drop `derived`, warn on `lost`.

### Regenerating

```sh
pnpm exec tsx docs/research/bedrock/scripts/list-registry-blocks.ts > /tmp/b0/registry-blocks.json
curl -o /tmp/b0/blocksJ2B.json https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/bedrock/1.26.30/blocksJ2B.json
curl -o /tmp/b0/blockStates.json https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/bedrock/1.26.60/blockStates.json
python3 -I docs/research/bedrock/scripts/derive-mapping.py /tmp/b0/registry-blocks.json \
  /tmp/b0/blocksJ2B.json /tmp/b0/blockStates.json docs/research/bedrock/scripts/curated.json \
  > docs/research/bedrock/block-mapping.json
pnpm exec prettier --write docs/research/bedrock
```

## Sources and their quality

| Source                                                                                                                                                                                                                                                                   | Used for                      | Quality                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [minecraft.wiki](https://minecraft.wiki) block pages ("Block states" BE tables), [Parity issue list](https://minecraft.wiki/w/Parity_issue_list), [Waterlogging](https://minecraft.wiki/w/Waterlogging), [Interaction range](https://minecraft.wiki/w/Interaction_range) | rules, state semantics        | Good, community-maintained, cites Mojira; some tables Java-centric or stale (barrel facing, redstone dust states).                    |
| minecraft.wiki copies of the official changelogs: [26.50](https://minecraft.wiki/w/Bedrock_Edition_26.50), [26.60](https://minecraft.wiki/w/Bedrock_Edition_26.60)                                                                                                       | new states, `.mcstructure` v2 | Good (verbatim copies with links to feedback.minecraft.net; the originals returned HTTP 403 to our fetcher).                          |
| [PrismarineJS minecraft-data](https://github.com/PrismarineJS/minecraft-data) `bedrock/1.26.30/blocksJ2B.json`, `bedrock/1.26.60/blockStates.json`                                                                                                                       | all id/state tables           | Good for names/types (dumped from the game protocol); the J2B table is **visual-oriented** (Geyser lineage) – we override two blocks. |
| [Microsoft Learn: intrinsic block states](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockstateslist)                                                                                                                 | state names                   | Outdated (2024, pre-flattening); only used as background.                                                                             |
| [Bedrock Wiki mcstructure](https://wiki.bedrock.dev/nbt/mcstructure), [tryashtar gist](https://gist.github.com/tryashtar/87ad9654305e5df686acab05cc4b6205)                                                                                                               | `.mcstructure` v1             | Good, consistent with each other; no v2 yet.                                                                                          |
| Mojira reports (MCPE-17487, MCPE-19723, MCPE-166446)                                                                                                                                                                                                                     | single rules                  | Weak to medium; titles only where the tracker was unreachable.                                                                        |

## Open questions (must be checked in-game, Bedrock 26.60)

1. Door `minecraft:cardinal_direction`: J2B says 90° offset from Java `facing`, the wiki says identical.
2. Redstone dust connection state names: `redstone_north` (minecraft-data) vs. `minecraft:connection_north`
   (changelog copy).
3. Hopper `toggle_bit` polarity (wiki: 1 = disabled; J2B: 1 = enabled).
4. Barrel `facing_direction` table (wiki lists 2=east … 5=north, data says generic 2=north … 5=east).
5. Pistons/observers/dispensers: is vertical facing chosen by pitch (Java) or by player position (old logic)?
6. Reach measuring point and eye height (standing/sneaking) in Bedrock.
7. Can torches/buttons attach to leaves in Bedrock?
8. Are wool/concrete stairs and slabs still redstone conductors in 26.60 (MCPE-240018)?
9. How to place two adjacent single chests in Bedrock without pairing.
10. `.mcstructure` v2: value of `format_version`, tag name/type of the compressed payload.
