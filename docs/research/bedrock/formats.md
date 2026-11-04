# `.mcstructure` (Bedrock structure file) and Java↔Bedrock conversion (B0)

Scope: what package B5 needs to import/export Bedrock structures, and how existing converters deal with blocks
that do not match. Status per claim: **verified** (official changelog copy or two independent sources) or
**assumed**.

## 1. Container

| Property         | Value                                                                                                                                                                                                                                                                                                                           | Status   | Source     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| Encoding         | NBT, **little-endian** (all Bedrock NBT files), root compound with empty name                                                                                                                                                                                                                                                   | verified | [BW], [TG] |
| Compression (v1) | none (raw NBT). Java `.nbt` structures are big-endian + gzip                                                                                                                                                                                                                                                                    | verified | [BW], [TG] |
| Compression (v2) | since **26.60**: optional root `compression` int, `0` = none, `1` = zlib; when `1`, the whole `structure` compound is serialised as NBT and stored as a zlib-compressed **byte array**; other root tags stay uncompressed; files without the tag load as uncompressed. **Structures exported by the game now use compression.** | verified | [BE26.60]  |
| Location         | behaviour pack `structures/<namespace>/<name>.mcstructure` → id `<namespace>:<name>`; export via structure block (Windows only per [BW])                                                                                                                                                                                        | verified | [SF], [BW] |

The exact NBT tag type of the compressed payload ("byte array") and the name of the tag that carries it are not
stated in the changelog copy. **Assumed:** the payload replaces the `structure` compound under the same name as a
`TAG_Byte_Array`. B5 must check this against a file exported from 26.60 before writing compressed files; reading
can sniff the tag type.

## 2. NBT layout

```text
(root)                                   TAG_Compound ""
├── format_version          TAG_Int      1 (v1) / 2 (v2, since 26.50 - assumed value, see below)
├── compression             TAG_Int      0 | 1  (v2, since 26.60, optional)
├── size                    TAG_List<TAG_Int>[3]   X, Y, Z
├── structure_world_origin  TAG_List<TAG_Int>[3]   where it was saved (used to re-base entity positions)
└── structure               TAG_Compound
    ├── block_indices       TAG_List[2] of TAG_List<TAG_Int>        (v1)
    │                       TAG_List of TAG_Int_Array, 2nd optional  (v2, since 26.50)
    ├── entities            TAG_List<TAG_Compound>   (entity NBT as in the world DB; Pos/UniqueID replaced on load)
    └── palette             TAG_Compound
        └── default         TAG_Compound            (only "default" is saved/loaded)
            ├── block_palette        TAG_List<TAG_Compound>
            │   ├── name             TAG_String   e.g. "minecraft:oak_stairs"
            │   ├── states           TAG_Compound strings → TAG_String, ints → TAG_Int, booleans → TAG_Byte
            │   └── version          TAG_Int      block-state version, 18168865 = 0x01153C21 (1.21.60.33) in 26.30-26.60
            └── block_position_data  TAG_Compound keyed by the flattened block index as a string
                └── "<index>"        TAG_Compound
                    ├── block_entity_data  TAG_Compound  (block entity NBT, position tags replaced on load)
                    └── tick_queue_data    TAG_List<TAG_Compound{ tick_delay: TAG_Int }>
```

Sources: [BW], [TG] (v1 tree, identical in both), [BE26.50] (v2 changes), [BE26.60] (compression), version int:
[BW] and the minecraft-data 26.60 permutation list (every permutation carries `version: 18168865`).

Details:

- **Index order** (verified, [TG], [BW]): ZYX order from the lowest north-west corner; Z varies fastest.
  `index = (x * sizeY + y) * sizeZ + z`; `x = i / sizeZ / sizeY`, `y = i / sizeZ % sizeY`, `z = i % sizeZ`.
- **Layers** (verified, [TG], [BW]): layer 0 = the block, layer 1 = an extra block in the same position, in
  practice water for waterlogged blocks (`minecraft:water`, `liquid_depth=0`). Both layers share the palette.
- **`-1`** (verified, [TG], [BW]): "no block" → the existing world block stays (structure void). Layer 1 is mostly
  `-1`. To force air, write a palette entry `minecraft:air`.
- **Version 2** (verified, [BE26.50]): `block_indices` arrays are `TAG_Int_Array` instead of lists of ints; the
  second array is optional and omitted when layer 1 is empty (~50 % smaller); v1 files still load and are upgraded
  on the next save. The changelog says "version 2 of the structure file format" but not the value of
  `format_version`. **Assumed:** `format_version = 2`. A reader should accept both encodings regardless of
  `format_version` (sniff list vs. int array).
- **Validation** (verified, [BW]): load fails (content log error) if required tags are missing or mistyped, if
  `block_indices` does not have exactly two arrays (v1), if the layers differ in length, or if the length differs
  from `sizeX*sizeY*sizeZ`. Out-of-range indices place air. `size` may exceed the structure-block UI limit.
- **Block states**: the `states` compound must use the exact Bedrock names and NBT types from
  `block-mapping.json` (`type: byte|int|string`). Unknown or missing states are filled with defaults by the game
  (assumed, common converter experience; not documented).
- **`version`** in palette entries lets the game upgrade old states. Writing the current value (18168865) is what
  the game itself does; an older value triggers the upgrader (assumed).

### Block entities we need (from our registry)

From the Bedrock block entity format ([BE-BE]); `id` strings are the Bedrock block entity ids.

| Block                                       | Needed for a working build                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| chest                                       | `pairx`, `pairz` (+ `pairlead`) to form a double chest; `Items`                                                         |
| furnace, barrel, dispenser, dropper, hopper | `Items` (optional; empty containers can omit the block entity, the game creates it - assumed)                           |
| noteblock                                   | `note` (byte 0-24) - the only place the pitch is stored                                                                 |
| piston / sticky_piston                      | `State`, `NewState`, `Progress`, `LastProgress`, `Sticky`, `AttachedBlocks`, `BreakBlocks`; write retracted (`State=0`) |
| moving_block                                | never exported (transient)                                                                                              |
| comparator                                  | `OutputSignal` (optional, recomputed)                                                                                   |

26.30 removed the `isMovable` field from all block entities ([BE-BE] history), so B5 must not write it.

## 3. How Java↔Bedrock converters handle mismatches

| Tool                                                                                                         | Approach                                                                                                                           | Mismatch handling                                                                                                                                                                                                                                         | Status                                  | Source                   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ |
| **Chunker** (Hive Games, MIT, funded by Mojang Studios)                                                      | World converter (Java 1.8.8-1.21.11 and 26.1-26.3 ↔ Bedrock 1.12-1.26.60). Block ids are validated against both palettes in tests. | Custom block mappings via JSON (`-m`). Behaviour for missing blocks not documented. Entities (except paintings/item frames) are not converted.                                                                                                            | verified (README)                       | [Chunker]                |
| **Amulet / PyMCTranslate**                                                                                   | Translates through a version-independent "universal" format using language-independent JSON mapping files.                         | Not documented in the README; in practice unknown blocks are kept with their original namespace/id (assumed).                                                                                                                                             | partly verified                         | [PyMCT]                  |
| **Geyser** (Java server → Bedrock client) and the community `blocksJ2B` table derived from the same approach | One Bedrock state per Java state, optimised for **looks** on a Bedrock client.                                                     | Visual tricks where Bedrock lacks a state (lever handle direction via `open_bit`), connection states recomputed client-side; hopper `toggle_bit` appears inverted relative to the wiki definition. Not suitable 1:1 for files that must behave correctly. | verified (data), interpretation assumed | [J2B], [Hopper], [Lever] |

Common patterns (synthesis, **assumed** as "usual practice"):

1. **Lookup table per Java state** → Bedrock id + states (our `block-mapping.json`).
2. **Neighbour-derived properties** (fence/pane/wall/dust connections, stair corners) are written but the game
   recomputes them on the next update; omitting them is safe, writing wrong ones only looks wrong until then.
3. **State → block entity**: note pitch, chest pairing, piston extension move into `block_entity_data`.
4. **`waterlogged` → layer 1** water block.
5. **Lossy states** (floor/ceiling button rotation, lever handle direction, leaves `distance`, `cave_air`) are
   collapsed to the nearest Bedrock state; tools rarely warn. Our editor should warn instead (ADR-0006).
6. **Unknown blocks**: Bedrock has `minecraft:unknown` and `minecraft:info_update` placeholder blocks (both in the
   26.60 permutation list). Writing a placeholder is better than silently writing air, because the user sees the
   gap. All 234 registry blocks have a Bedrock equivalent in 26.60, so this only matters for future blocks.

## 4. Recommendations for B5

- Reader: accept v1 (list) and v2 (int array, optional layer 1), with and without `compression`.
- Writer: write v1-compatible **uncompressed** files first (load everywhere since forever); add v2/zlib once a
  26.60 export has been inspected.
- Always write `version: 18168865` until a newer permutation list shows a different value; take it from the mapping
  data, not a constant in code.
- Put water of waterlogged blocks in layer 1; never use `-1` in layer 0 inside the build bounding box unless the user
  wants "keep existing blocks".

## Sources

| Key       | URL                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| [BW]      | https://wiki.bedrock.dev/nbt/mcstructure (community, Bedrock Wiki)                                                |
| [TG]      | https://gist.github.com/tryashtar/87ad9654305e5df686acab05cc4b6205 (community reference, tryashtar)               |
| [SF]      | https://minecraft.wiki/w/Structure_file                                                                           |
| [BE26.50] | https://minecraft.wiki/w/Bedrock_Edition_26.50 → "Structure files" (copy of the official changelog)               |
| [BE26.60] | https://minecraft.wiki/w/Bedrock_Edition_26.60 → "Commands → .mcstructure Files" (copy of the official changelog) |
| [BE-BE]   | https://minecraft.wiki/w/Bedrock_Edition_level_format/Block_entity_format                                         |
| [Chunker] | https://github.com/HiveGamesOSS/Chunker                                                                           |
| [PyMCT]   | https://github.com/gentlegiantJGC/PyMCTranslate                                                                   |
| [J2B]     | https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.26.30/blocksJ2B.json                    |
| [Hopper]  | https://minecraft.wiki/w/Hopper#Block_states                                                                      |
| [Lever]   | https://minecraft.wiki/w/Lever#Block_states                                                                       |
