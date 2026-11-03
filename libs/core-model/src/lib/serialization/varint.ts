/** Unsigned LEB128 varints, the same scheme Sponge Schematic v3 uses for block data. */

const MAX_VARINT_VALUE = 0xffffffff;

/** Number of bytes needed to encode `value`. */
export function varintLength(value: number): number {
  let n = 1;
  while (value >= 0x80) {
    value = Math.floor(value / 128);
    n++;
  }
  return n;
}

export function encodeVarints(values: ArrayLike<number>): Uint8Array {
  let size = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (!Number.isInteger(v) || v < 0 || v > MAX_VARINT_VALUE) {
      throw new RangeError(`Cannot varint-encode ${v}`);
    }
    size += varintLength(v);
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < values.length; i++) {
    let v = values[i] as number;
    while (v >= 0x80) {
      out[p++] = (v % 128) | 0x80;
      v = Math.floor(v / 128);
    }
    out[p++] = v;
  }
  return out;
}

/**
 * Decodes exactly `count` varints, each ≤ `maxValue`. Rejects truncated data,
 * trailing bytes, overlong encodings (non-minimal byte sequences) and values
 * above `maxValue`, so every value has exactly one valid encoding.
 */
export function decodeVarints(
  bytes: Uint8Array,
  count: number,
  maxValue: number = MAX_VARINT_VALUE,
): Uint32Array {
  const maxBytes = varintLength(maxValue);
  const out = new Uint32Array(count);
  let p = 0;
  for (let i = 0; i < count; i++) {
    let value = 0;
    let multiplier = 1;
    let length = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('Truncated varint data');
      const b = bytes[p++] as number;
      length++;
      if (length > maxBytes) throw new Error('Varint too long');
      value += (b & 0x7f) * multiplier;
      if ((b & 0x80) === 0) {
        if (b === 0 && length > 1) throw new Error('Overlong varint encoding');
        break;
      }
      multiplier *= 128;
    }
    if (value > maxValue) throw new Error(`Varint value ${value} exceeds ${maxValue}`);
    out[i] = value;
  }
  if (p !== bytes.length) throw new Error('Trailing bytes after varint data');
  return out;
}
