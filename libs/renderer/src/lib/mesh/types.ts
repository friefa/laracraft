import type {
  BlockStateString,
  ChunkCoord,
  Direction,
  RenderLayer,
  RenderShape,
} from '@laracraft/core-model';

/**
 * Renderer mesh contract (lead-owned). Everything in `mesh/` is DOM-free and
 * three.js-free so it runs in a Web Worker; `scene/` turns it into three.js objects.
 *
 * Texturing: textures are sampled from a `DataArrayTexture` (one 16×16 layer per
 * texture name, built from atlas.png + atlas.json). UVs are in block units and
 * repeat across greedy-merged quads; `layers` selects the texture layer.
 */

/** Texture name → layer index in the texture array. */
export type TextureLayers = Readonly<Record<string, number>>;

/** Colour multiplier for grayscale textures (Minecraft-style tinting). */
export type TintKind = 'none' | 'grass' | 'foliage' | 'water' | 'redstone';

export interface FaceTextures {
  readonly up: string;
  readonly down: string;
  readonly north: string;
  readonly south: string;
  readonly west: string;
  readonly east: string;
}

/**
 * Render info for one palette entry, resolved on the main thread from the registry
 * (`resolveRenderInfo` in `mesh/render-info.ts`) and sent to the worker once per palette change.
 * Index-aligned with the document palette; index 0 (air) has shape `none`.
 */
export interface PaletteRenderInfo {
  readonly state: BlockStateString;
  readonly shape: RenderShape;
  readonly layer: RenderLayer;
  /** Per-face texture names for `full` blocks, already rotated for `facing`/`axis`. */
  readonly faces?: FaceTextures;
  /** Per-face tint (e.g. grass block: top tinted, sides untinted overlay ignored in MVP). */
  readonly tint?: Readonly<Partial<Record<Direction, TintKind>>>;
  /** For `model` blocks: renderer model id from the registry. */
  readonly modelId?: string;
  /** Full opaque cube: hides neighbour faces (face culling). */
  readonly occludes: boolean;
}

/** Flat GPU-ready buffers. All arrays are tightly packed per vertex. */
export interface MeshBuffers {
  readonly positions: Float32Array; // xyz
  readonly normals: Float32Array; // xyz
  readonly uvs: Float32Array; // uv in block units (repeat)
  readonly layers: Float32Array; // texture array layer per vertex
  readonly colors: Float32Array; // rgb: tint × face shade (top 1.0, N/S 0.8, E/W 0.6, bottom 0.5)
  readonly indices: Uint32Array;
}

/**
 * Input for meshing one chunk. `data` covers the chunk plus a 1-block border
 * (18×18×18, YZX order: x + z*18 + y*324, local coordinate +1) so faces on chunk
 * borders are culled correctly without access to neighbour chunks.
 */
export interface ChunkMeshInput {
  readonly coord: ChunkCoord;
  readonly data: Uint16Array;
  /** Hide blocks above this world Y (layer slider); undefined = no limit. */
  readonly maxY?: number;
}

/** Positions of model blocks in a chunk, grouped by palette index (for instancing). */
export interface ModelInstances {
  readonly paletteIndex: number;
  /** World block coordinates, xyz triples. */
  readonly positions: Int32Array;
}

export interface ChunkMeshOutput {
  readonly coord: ChunkCoord;
  /** Greedy-meshed full blocks, one buffer set per render layer (empty arrays if none). */
  readonly opaque: MeshBuffers;
  readonly cutout: MeshBuffers;
  readonly translucent: MeshBuffers;
  readonly models: readonly ModelInstances[];
}

/**
 * Unit-space geometry for one `model` blockstate (block occupies [0,1]³), produced by
 * `models/` from a PaletteRenderInfo + texture layers; instanced by the scene.
 */
export type ModelGeometry = MeshBuffers;

/** Worker protocol for the mesher. */
export type MesherRequest =
  | {
      readonly type: 'init';
      readonly palette: readonly PaletteRenderInfo[];
      readonly textures: TextureLayers;
    }
  | { readonly type: 'mesh'; readonly id: number; readonly input: ChunkMeshInput };

export type MesherResponse =
  | { readonly type: 'mesh'; readonly id: number; readonly output: ChunkMeshOutput }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
