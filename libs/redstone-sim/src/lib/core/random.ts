/**
 * Deterministic `java.util.Random` (48-bit LCG). Java's level random is seeded from the
 * world; the simulator uses a fixed seed so runs are reproducible. Only used where Java
 * picks randomly (dispenser/dropper slot choice).
 */
export class JavaRandom {
  private seed: bigint;

  constructor(seed: number) {
    this.seed = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  private next(bits: number): number {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  nextInt(bound: number): number {
    if (bound <= 0) throw new RangeError('bound must be positive');
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0 || bits - val + (bound - 1) > 0x7fffffff);
    return val;
  }
}
