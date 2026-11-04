import { MISSING_TEXTURE } from './render-info';
import type { TextureLayers } from './types';

/** Minimal view of `atlas.json` (see `tools/textures/README.md`) needed for layer order. */
export interface AtlasJsonLike {
  readonly textures: Readonly<Record<string, unknown>>;
}

/**
 * Texture names in texture-array layer order: `missing` first (layer 0, so it is
 * also the fallback for unknown names), then all other names sorted by code unit
 * order. Deterministic for a given atlas; the scene builds the `DataArrayTexture`
 * layers in exactly this order.
 */
export function textureLayerNames(atlas: AtlasJsonLike): string[] {
  const names = Object.keys(atlas.textures)
    .filter((n) => n !== MISSING_TEXTURE)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.hasOwn(atlas.textures, MISSING_TEXTURE) ? [MISSING_TEXTURE, ...names] : names;
}

/** Name → layer index map for the mesher, consistent with {@link textureLayerNames}. */
export function createTextureLayers(atlas: AtlasJsonLike): TextureLayers {
  const layers: Record<string, number> = Object.create(null) as Record<string, number>;
  textureLayerNames(atlas).forEach((name, i) => {
    layers[name] = i;
  });
  return layers;
}

/** Layer of a texture name; unknown names fall back to `missing` (or layer 0). */
export function textureLayerOf(layers: TextureLayers, name: string): number {
  if (Object.hasOwn(layers, name)) return layers[name] ?? 0;
  return Object.hasOwn(layers, MISSING_TEXTURE) ? (layers[MISSING_TEXTURE] ?? 0) : 0;
}
