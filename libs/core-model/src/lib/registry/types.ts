import type { BlockId } from '../blockstate/blockstate';
import type { Direction } from '../math/direction';

/**
 * Block registry contract (Java Edition semantics).
 *
 * The registry is pure data. Everything the renderer, the editor, the Lara DSL
 * validator and the build-order engine need to know about a block lives here,
 * so that rules are data-driven and testable instead of scattered `if (id === …)`.
 *
 * Fields marked "build-order" are consumed by `libs/build-order` (M2). They are
 * already part of the M0 contract so that the registry is filled in once.
 */

export type BlockCategory =
  | 'building'
  | 'natural'
  | 'wood'
  | 'stone'
  | 'colored'
  | 'glass'
  | 'decoration'
  | 'lighting'
  | 'redstone'
  | 'transport'
  | 'utility'
  | 'fluid'
  | 'technical';

/**
 * Render shape class.
 * - `full`: opaque or cutout unit cube; eligible for greedy meshing.
 * - `model`: non-cube geometry (stairs, slabs, torches, …); rendered via instancing.
 * - `none`: not rendered (air, technical blocks).
 */
export type RenderShape = 'full' | 'model' | 'none';

/** How light passes through for meshing/culling purposes. */
export type RenderLayer = 'opaque' | 'cutout' | 'translucent';

/**
 * Texture assignment for a block. Names refer to entries in the texture
 * manifest (`assets/textures/manifest.json`), never to Mojang file names.
 * `model` blocks may additionally be described by `modelId` (renderer-owned).
 */
export type BlockTextures =
  | { readonly all: string }
  | { readonly top: string; readonly bottom: string; readonly side: string }
  | { readonly end: string; readonly side: string } // logs, pillars (axis-aware)
  /**
   * Explicit faces. For directional full blocks (furnace, observer, piston,
   * dispenser, barrel …) faces are given for the state `facing=north` and the
   * renderer rotates them according to the actual `facing`.
   */
  | { readonly faces: Readonly<Partial<Record<Direction | 'side', string>>> };

/** A blockstate property and its allowed values (first entry is NOT implied default). */
export interface PropertyDefinition {
  readonly values: readonly string[];
  readonly default: string;
}

/**
 * build-order: what has to exist before this block can be placed (and stay).
 *
 * - `none`: free-standing (full blocks; still needs *some* neighbour to click on,
 *   which the reachability rule handles, not this one).
 * - `below`: needs a supporting block directly below (torch on floor, carpet,
 *   redstone wire, rails, pressure plates, lower door half, sapling, …).
 * - `facing`: attached to the block on the side *opposite* to `property`
 *   (wall torch facing=north hangs on the block south of it; ladders; wall signs).
 * - `face`: attach face given by a `face` property (`floor|wall|ceiling`) combined
 *   with `facing` for walls (levers, buttons, grindstone).
 * - `ceiling`: needs the block above (hanging lantern when `hanging=true` uses
 *   `conditional`).
 * - `conditional`: rule depends on a property value (e.g. lantern `hanging`).
 */
export type SupportRule =
  | { readonly kind: 'none' }
  | { readonly kind: 'below'; readonly needs?: FaceSupport }
  | { readonly kind: 'ceiling'; readonly needs?: FaceSupport }
  | { readonly kind: 'facing'; readonly property: string; readonly needs?: FaceSupport }
  | {
      readonly kind: 'face';
      readonly faceProperty: string;
      readonly facingProperty: string;
      readonly needs?: FaceSupport;
    }
  | {
      readonly kind: 'conditional';
      readonly property: string;
      readonly cases: Readonly<Record<string, SupportRule>>;
    };

/**
 * build-order: how much a block face can carry, ordered `none < center < rigid < full`
 * (Java: no support / `canSupportCenter` / `canSupportRigidBlock` / sturdy full face).
 * - `full`: full sturdy face (stone, glass, top of upper slab). Carries everything.
 * - `rigid`: enough for rails, repeaters, comparators, redstone wire (hopper top).
 * - `center`: only the centre is supported (top of fences/walls): torches, lanterns,
 *   pressure plates.
 * - `none`: nothing can attach (leaves, honey, air).
 *
 * `SupportRule.needs` is the minimum the supporting face must offer. When omitted it
 * is `full`. `needs: 'none'` means "any non-air block" (carpet).
 */
export type FaceSupport = 'none' | 'center' | 'rigid' | 'full';

export const FACE_SUPPORT_ORDER: Readonly<Record<FaceSupport, number>> = {
  none: 0,
  center: 1,
  rigid: 2,
  full: 3,
};

/** Support offered by the faces of one blockstate. `side` = the four horizontal faces. */
export interface FaceSupportSpec {
  readonly up: FaceSupport;
  readonly down: FaceSupport;
  readonly side: FaceSupport;
}

/**
 * Support offered by a block, optionally depending on its state. The first case
 * whose `when` matches all listed properties wins; otherwise `default`.
 * Blocks without `supportFaces` offer `full` everywhere if `solid`, else `none`.
 * Known approximation: direction-dependent faces (back of stairs) are not modelled.
 */
export interface SupportFaces {
  readonly default: FaceSupportSpec;
  readonly cases?: readonly {
    readonly when: Readonly<Record<string, string>>;
    readonly faces: FaceSupportSpec;
  }[];
}

/**
 * build-order: how the player determines the blockstate when placing.
 * Each entry names a property and where its value comes from.
 * - `playerFacing`: horizontal look direction of the player (stairs `facing`).
 * - `playerFacingOpposite`: opposite of look direction (repeater/comparator
 *   `facing` points towards the player, furnace, chest). Must be verified per
 *   block against Java Edition behaviour.
 * - `playerLook3d`: full 3D look direction incl. up/down (observer `facing`).
 * - `playerLook3dOpposite`: opposite of the 3D look (pistons, dispensers, droppers, barrels).
 * - `clickedFace`: the face of the neighbour that was clicked, i.e. the direction
 *   from the clicked neighbour to the new block (wall torch, ladder, logs `axis`).
 * - `clickedFaceOpposite`: opposite of `clickedFace`, pointing into the clicked
 *   block (hopper `facing`; values the property does not allow, e.g. `up`, fall
 *   back to the property default).
 * - `clickedHalf`: upper/lower half of the clicked face (stairs/slabs/trapdoors `half`/`type`).
 * - `neighbors`: derived from neighbours after placement (fences, panes, walls,
 *   redstone wire connections, stair `shape`) — not player-controlled.
 * - `interaction`: set by right-clicking after placement (repeater `delay`,
 *   comparator `mode`, note block `note`).
 * - `fixed`: always the same value when placed: `PlacementRule.value`, or the
 *   property default when omitted (e.g. `powered=false`, leaves `persistent=true`).
 * - `environment`: set by the world at the position (`waterlogged` from water).
 *   Properties without any rule are treated like `fixed` with the default,
 *   except `waterlogged`, which is implicitly `environment`.
 */
export type PlacementSource =
  | 'playerFacing'
  | 'playerFacingOpposite'
  | 'playerLook3d'
  | 'playerLook3dOpposite'
  | 'clickedFace'
  | 'clickedFaceOpposite'
  | 'clickedHalf'
  | 'neighbors'
  | 'interaction'
  | 'fixed'
  | 'environment';

/**
 * Several rules for the same property are allowed when each has a `when`
 * condition (e.g. lever `facing` = `clickedFace` when `face=wall`, otherwise
 * `playerFacing`). The first rule whose condition matches wins; a rule without
 * `when` is the fallback and must come last.
 */
export interface PlacementRule {
  readonly property: string;
  readonly source: PlacementSource;
  /** Only for `source: 'fixed'`: the value set on placement (default: property default). */
  readonly value?: string;
  /** Rule applies only when another property of the same state has this value. */
  readonly when?: { readonly property: string; readonly value: string };
}

/**
 * build-order: redstone role. `triggersOnPlace` marks components that can fire
 * or change state the moment they are placed or when a neighbour is placed or
 * changed afterwards (pistons and TNT next to power, dispensers/droppers, and
 * observers, which do NOT pulse on their own placement since Java 1.13 but fire
 * when the watched block is placed or changed).
 */
export type RedstoneRole =
  | 'source' // lever, button, redstone block, torch, daylight detector, pressure plate…
  | 'wire'
  | 'repeater'
  | 'comparator'
  | 'actuator' // piston, sticky piston, dispenser, dropper, door, trapdoor, lamp, note block, TNT
  | 'observer'
  | 'container' // hopper, chest (comparator input)
  | 'conductor'; // solid blocks are conductors implicitly; use for special cases only

export interface RedstoneInfo {
  readonly role: RedstoneRole;
  readonly triggersOnPlace?: boolean;
}

/**
 * Materials needed to place one block in this state (material lists, M2).
 * Default when omitted: one item with the block's own id.
 */
export interface ItemCost {
  /** Item id, e.g. `minecraft:redstone` for `minecraft:redstone_wire`. */
  readonly item: string;
  /** Count for one placed block, default 1. */
  readonly count?: number;
  /** Count by property value, e.g. slab `type=double` → 2. Overrides `count`. */
  readonly countByProperty?: {
    readonly property: string;
    readonly counts: Readonly<Record<string, number>>;
  };
  /**
   * Multi-block structures where only one part costs the item (doors, beds,
   * tall plants): the part with this property value carries the cost, the other
   * part costs nothing and is placed implicitly with it.
   */
  readonly primaryPart?: { readonly property: string; readonly value: string };
}

export interface BlockDefinition {
  readonly id: BlockId;
  /** i18n key for the display name, e.g. `block.oak_stairs`. */
  readonly nameKey: string;
  readonly category: BlockCategory;
  readonly properties: Readonly<Record<string, PropertyDefinition>>;
  readonly render: {
    readonly shape: RenderShape;
    readonly layer: RenderLayer;
    readonly textures?: BlockTextures;
    /** Renderer model id for `shape: 'model'`, e.g. `stairs`, `slab`, `torch`. */
    readonly modelId?: string;
    /** Emits light (for future lighting); 0–15. */
    readonly lightEmission?: number;
    /** Light per property value (e.g. redstone lamp `lit=true` → 15); overrides `lightEmission`. */
    readonly lightByProperty?: {
      readonly property: string;
      readonly levels: Readonly<Record<string, number>>;
    };
  };
  /**
   * Shorthand: the block offers a full sturdy face on all sides (torches, buttons…
   * can attach). Refined by `supportFaces`.
   */
  readonly solid: boolean;
  /** build-order: per-face support, see {@link SupportFaces}. */
  readonly supportFaces?: SupportFaces;
  /** build-order rules. */
  readonly physics: {
    readonly gravity?: boolean; // sand, gravel, concrete powder, anvil…
    readonly fluid?: boolean; // water, lava (sources and flowing)
    readonly support: SupportRule;
  };
  readonly placement?: readonly PlacementRule[];
  readonly redstone?: RedstoneInfo;
  readonly item?: ItemCost;
  /** Free-form search tags (English), used by the palette search. */
  readonly tags?: readonly string[];
}

export interface BlockRegistry {
  readonly version: string; // targeted Java Edition version, e.g. "1.21.x"
  get(id: BlockId): BlockDefinition | undefined;
  has(id: BlockId): boolean;
  all(): readonly BlockDefinition[];
}
