/** Unsigned LEB128 varints, the same scheme Sponge Schematic v3 uses for block data. */

export function encodeVarints(values: ArrayLike<number>): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let v = values[i] as number;
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`Cannot varint-encode ${v}`);
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    out.push(v);
  }
  return Uint8Array.from(out);
}

/** Decodes exactly `count` varints; throws on truncated or trailing data. */
export function decodeVarints(bytes: Uint8Array, count: number): Uint32Array {
  const out = new Uint32Array(count);
  let p = 0;
  for (let i = 0; i < count; i++) {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (p >= bytes.length) throw new Error('Truncated varint data');
      const b = bytes[p++] as number;
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new Error('Varint too long');
    }
    out[i] = value >>> 0;
  }
  if (p !== bytes.length) throw new Error('Trailing bytes after varint data');
  return out;
}
