/* waterfall-texture.ts — процедурная текстура водопада ручья (32×32).
 *
 * В 3D нет смысла держать 16×16: струя растягивалась и выглядела мутно.
 * Здесь та же струя и пена, но в 32×32 — прожилки тоньше, брызги чётче.
 */

export const FALL_TEX = 32;

export const FALL_FOAM_V = 0.25;

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(r: number, g: number, b: number): string {
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function createWaterfallCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FALL_TEX;
  cv.height = FALL_TEX;
  const ctx = cv.getContext('2d')!;
  const rand = rnd(0xfa11);

  const foamH = Math.round(FALL_TEX * FALL_FOAM_V);   // 8 px
  const bodyTop = 0;
  const bodyBottom = FALL_TEX - foamH;                // 24 px

  ctx.fillStyle = rgb(62, 108, 168);
  ctx.fillRect(0, bodyTop, FALL_TEX, bodyBottom - bodyTop);

  const streak = (x: number, w: number, color: string): void => {
    for (const off of [0, -FALL_TEX]) {
      const bx = x + off;
      if (bx >= FALL_TEX || bx + w <= 0) continue;
      ctx.fillStyle = color;
      let px = bx;
      for (let y = bodyTop; y < bodyBottom; y++) {
        ctx.fillRect(px, y, w, 1);
        if (rand() < 0.22) px += rand() < 0.5 ? -1 : 1;
        px = ((px % FALL_TEX) + FALL_TEX) % FALL_TEX;
      }
    }
  };

  for (let i = 0; i < 7; i++) {
    streak(Math.floor(rand() * FALL_TEX), 2 + Math.floor(rand() * 3), rgb(96, 148, 208));
  }
  for (let i = 0; i < 4; i++) {
    streak(Math.floor(rand() * FALL_TEX), 2 + Math.floor(rand() * 3), rgb(148, 194, 232));
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = rgb(226, 240, 252);
    ctx.fillRect(Math.floor(rand() * FALL_TEX), bodyTop + Math.floor(rand() * (bodyBottom - bodyTop)), 1, 1);
  }

  ctx.fillStyle = rgb(232, 242, 251);
  ctx.fillRect(0, bodyBottom, FALL_TEX, foamH);
  for (let i = 0; i < 44; i++) {
    const x = Math.floor(rand() * FALL_TEX);
    const y = bodyBottom + Math.floor(rand() * foamH);
    ctx.fillStyle = rand() < 0.5 ? rgb(178, 212, 240) : rgb(255, 255, 255);
    ctx.fillRect(x, y, 1 + Math.floor(rand() * 2), 1);
  }

  return cv;
}
