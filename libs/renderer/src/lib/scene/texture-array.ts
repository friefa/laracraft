import * as THREE from 'three';
import type { AtlasJson, RgbaImage, SlicedLayers } from './atlas-slicing';

/** Texture array for the block shader: nearest filtering, no mipmaps, repeat, sRGB. */
export function createTextureArray(sliced: SlicedLayers): THREE.DataArrayTexture {
  const layers = Math.max(1, sliced.names.length);
  const tex = new THREE.DataArrayTexture(sliced.data, sliced.tileSize, sliced.tileSize, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Loads `atlas.json` and the PNG it names (resolved relative to the JSON URL). Browser only. */
export async function loadAtlas(atlasUrl: string): Promise<{ atlas: AtlasJson; image: RgbaImage }> {
  const base = typeof location !== 'undefined' ? location.href : undefined;
  const jsonUrl = new URL(atlasUrl, base);
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`Failed to load ${jsonUrl.href}: ${res.status}`);
  const atlas = (await res.json()) as AtlasJson;
  const pngUrl = new URL(atlas.image ?? 'atlas.png', jsonUrl);
  const pngRes = await fetch(pngUrl);
  if (!pngRes.ok) throw new Error(`Failed to load ${pngUrl.href}: ${pngRes.status}`);
  const bitmap = await createImageBitmap(await pngRes.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    return { atlas, image: readPixels(bitmap) };
  } finally {
    bitmap.close();
  }
}

function readPixels(bitmap: ImageBitmap): RgbaImage {
  const { width, height } = bitmap;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}
