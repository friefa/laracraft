import { textureLayerNames } from '../mesh/texture-layers';

/** One texture rect from `atlas.json` (see `tools/textures/README.md`). */
export interface AtlasTextureRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly frames?: number;
}

/** The parts of `atlas.json` the renderer reads. */
export interface AtlasJson {
  readonly version?: number;
  readonly image?: string;
  readonly width?: number;
  readonly height?: number;
  readonly textures: Readonly<Record<string, AtlasTextureRect>>;
}

/** Decoded RGBA image (e.g. `ImageData`). Row 0 is the top row. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface SlicedLayers {
  /** Texture names in layer order (= `textureLayerNames(atlas)`). */
  readonly names: readonly string[];
  readonly tileSize: number;
  /** RGBA8, `tileSize² · 4` bytes per layer, rows bottom-up (row 0 = bottom of the image). */
  readonly data: Uint8Array;
}

/**
 * Cuts the atlas into texture-array layers: one `tileSize`² layer per texture, in
 * `textureLayerNames` order, first animation frame only (frame = top `w × w` square of a
 * strip). Larger textures are nearest-neighbour downsampled. Rows are stored bottom-up so
 * that GL-style UVs (v = 1 = top image row) sample the layer directly. Pixels outside the
 * image read as transparent black.
 */
export function sliceAtlas(atlas: AtlasJson, image: RgbaImage, tileSize = 16): SlicedLayers {
  const names = textureLayerNames(atlas);
  const layerBytes = tileSize * tileSize * 4;
  const data = new Uint8Array(Math.max(1, names.length) * layerBytes);
  const src = image.data;
  names.forEach((name, layer) => {
    const rect = atlas.textures[name];
    if (!rect) return;
    const frameW = rect.w;
    const frameH = Math.min(rect.h, rect.w); // first frame of a vertical strip
    const base = layer * layerBytes;
    for (let row = 0; row < tileSize; row++) {
      // Destination row `row` (bottom-up) shows image row `tileSize - 1 - row` of the tile.
      const sy = rect.y + Math.floor(((tileSize - 1 - row + 0.5) * frameH) / tileSize);
      for (let col = 0; col < tileSize; col++) {
        const sx = rect.x + Math.floor(((col + 0.5) * frameW) / tileSize);
        const o = base + (row * tileSize + col) * 4;
        if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
        const i = (sy * image.width + sx) * 4;
        data[o] = src[i] ?? 0;
        data[o + 1] = src[i + 1] ?? 0;
        data[o + 2] = src[i + 2] ?? 0;
        data[o + 3] = src[i + 3] ?? 0;
      }
    }
  });
  return { names, tileSize, data };
}
