/* noise.ts — детерминированный ГПСЧ (mulberry) и генератор шума (value noise + fBm).
Общий для генерации острова (world.ts) и эффекта тумана (engine.ts). */

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NoiseGenerator {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = new Uint8Array(512);
    const rng = mulberry(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private hash(x: number, y: number): number {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }

  private smooth(t: number): number { return t * t * (3 - 2 * t); }

  /** Одиночный слой value noise, результат 0..1 */
  public value(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = this.smooth(x - ix), fy = this.smooth(y - iy);
    const a = this.hash(ix, iy), b = this.hash(ix + 1, iy);
    const c = this.hash(ix, iy + 1), d = this.hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /** Фрактальный шум (fBm) — сумма октав, результат 0..1 */
  public fbm(x: number, y: number, octaves = 4): number {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += this.value(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }
}
