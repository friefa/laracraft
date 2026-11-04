import type { RgbaImage } from '../lib/png';

/**
 * Number of pixels that differ between two decoded images, or `undefined` if the
 * sizes differ. Fully transparent pixels count as equal whatever their RGB
 * values, because PNG optimisers routinely rewrite the colour of invisible pixels.
 */
export function countPixelDiff(a: RgbaImage, b: RgbaImage): number | undefined {
  if (a.width !== b.width || a.height !== b.height) return undefined;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const alphaA = a.data[i + 3];
    const alphaB = b.data[i + 3];
    if (alphaA === 0 && alphaB === 0) continue;
    if (
      alphaA !== alphaB ||
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    ) {
      diff++;
    }
  }
  return diff;
}

export type Authorship = 'xssheep' | 'adapted';

export interface AuthorshipVerdict {
  authorship: Authorship;
  /** Human-readable reason, for the import report. */
  reason: string;
}

/**
 * Decide who gets credited for an imported file. XSSheep only if the pixels are
 * identical to the reference and the block existed in XSSheep's era; everything
 * else is credited to the PPL contributors (with XSSheep as original author).
 */
export function classifyAuthorship(
  imported: RgbaImage,
  reference: RgbaImage | undefined,
  introducedIn: string | undefined,
): AuthorshipVerdict {
  if (!reference) return { authorship: 'adapted', reason: 'not in the reference' };
  const diff = countPixelDiff(imported, reference);
  if (diff === undefined) {
    return {
      authorship: 'adapted',
      reason: `size differs (${imported.width}x${imported.height} vs ${reference.width}x${reference.height})`,
    };
  }
  if (diff > 0) return { authorship: 'adapted', reason: `${diff} pixel(s) differ` };
  if (introducedIn) {
    return {
      authorship: 'adapted',
      reason: `identical to the reference, but the block was added in Java ${introducedIn} (after XSSheep's 1.11 pack)`,
    };
  }
  return { authorship: 'xssheep', reason: 'pixel-identical to the reference' };
}
