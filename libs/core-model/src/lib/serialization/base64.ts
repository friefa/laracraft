// Minimal base64 (RFC 4648, with padding). Engine libs have no DOM/Node globals.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHARS: readonly string[] = ALPHABET.split('');
const ch = (i: number): string => CHARS[i] as string;
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += ch(n >> 18) + ch((n >> 12) & 63) + ch((n >> 6) & 63) + ch(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    out += ch(n >> 18) + ch((n >> 12) & 63) + '==';
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += ch(n >> 18) + ch((n >> 12) & 63) + ch((n >> 6) & 63) + '=';
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('Invalid base64 length');
  let padding = 0;
  if (text.endsWith('==')) padding = 2;
  else if (text.endsWith('=')) padding = 1;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => {
      const ch = text.charCodeAt(i + k);
      if (ch === 61 /* = */ && i + k >= text.length - padding) return 0;
      const v = ch < 128 ? (LOOKUP[ch] as number) : -1;
      if (v < 0) throw new Error(`Invalid base64 character at ${i + k}`);
      return v;
    }) as [number, number, number, number];
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
