// Deterministic seeded RNG (mulberry32 + string hashing).
// Seed-driven everything: star-chart, system layouts, resonance offers,
// shops, anomalies — all derive from one run seed so the Daily Cinder is fair.

export class RNG {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'number' ? seed >>> 0 : RNG.hash(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  static hash(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h ^ (h >>> 16)) >>> 0;
  }

  /** float in [0,1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** int in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** float in [lo, hi). */
  float(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Fisher-Yates, returns a new shuffled copy. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Pick n distinct items. */
  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(n, arr.length));
  }

  /** Weighted pick. weights parallel to items. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Fork a deterministic child stream keyed by a label. */
  fork(label: string): RNG {
    return new RNG(RNG.hash(label + ':' + this.state));
  }
}
