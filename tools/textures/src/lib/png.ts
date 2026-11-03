import { readFileSync, writeFileSync } from 'node:fs';
import pngjs from 'pngjs';

const { PNG } = pngjs;

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 8 bit per channel, row-major, top-left origin. */
  data: Uint8Array;
}

export function decodePng(buf: Buffer): RgbaImage {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function readPng(path: string): RgbaImage {
  return decodePng(readFileSync(path));
}

/** Encode deterministically (pngjs writes no timestamps; fixed zlib settings). */
export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9, filterType: -1 });
}

export function writePng(path: string, img: RgbaImage): void {
  writeFileSync(path, encodePng(img));
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}
