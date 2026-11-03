// Strict base64 (RFC 4648, padded). Engine libs have no DOM/Node globals.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHARS: readonly string[] = ALPHABET.split('');
const ch = (i: number): string => CHARS[i] as string;
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    parts.push(ch(n >> 18) + ch((n >> 12) & 63) + ch((n >> 6) & 63) + ch(n & 63));
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    parts.push(ch(n >> 18) + ch((n >> 12) & 63) + '==');
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    parts.push(ch(n >> 18) + ch((n >> 12) & 63) + ch((n >> 6) & 63) + '=');
  }
  return parts.join('');
}

function sextet(text: string, i: number): number {
  const c = text.charCodeAt(i);
  const v = c < 128 ? (LOOKUP[c] as number) : -1;
  if (v < 0) throw new Error(`Invalid base64 character at ${i}`);
  return v;
}

/** Decodes padded base64; rejects bad characters, misplaced padding and non-zero pad bits. */
export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('Invalid base64 length');
  let padding = 0;
  if (text.endsWith('==')) padding = 2;
  else if (text.endsWith('=')) padding = 1;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  const full = text.length - (padding > 0 ? 4 : 0);
  let o = 0;
  for (let i = 0; i < full; i += 4) {
    const n =
      (sextet(text, i) << 18) |
      (sextet(text, i + 1) << 12) |
      (sextet(text, i + 2) << 6) |
      sextet(text, i + 3);
    out[o++] = (n >> 16) & 255;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  if (padding === 2) {
    const a = sextet(text, full);
    const b = sextet(text, full + 1);
    if ((b & 15) !== 0) throw new Error('Non-zero base64 pad bits');
    out[o++] = (a << 2) | (b >> 4);
  } else if (padding === 1) {
    const a = sextet(text, full);
    const b = sextet(text, full + 1);
    const c = sextet(text, full + 2);
    if ((c & 3) !== 0) throw new Error('Non-zero base64 pad bits');
    out[o++] = (a << 2) | (b >> 4);
    out[o++] = ((b & 15) << 4) | (c >> 2);
  }
  return out;
}
