/* cliff-texture.ts — процедурная текстура вертикальной грани утёса (32×32).
 *
 * В 3D нет смысла держать 16×16: стена растягивалась и читалась как муть.
 * Здесь та же кладка, но в 32×32 — блоки вдвое крупнее и чётче, швы тоньше
 * относительно блока, крапины не превращаются в шум.
 */

/** Сторона тайла текстуры: одна терраса = один тайл по UV. */
export const CLIFF_TEX = 32;

/**
 * Рядов блоков в тайле: два ряда на террасу → блок высотой ~0.45 ед. при
 * ширине тайла 1.0.
 *
 * Экспортируется, чтобы геометрия подступенков лестниц знала, сколько рядов
 * в текстуре: один подступенок = ровно один ряд кладки.
 */
export const CLIFF_ROWS = 2;
const ROWS = CLIFF_ROWS;

/** Детерминированный ГПСЧ (mulberry32). */
function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gray(v: number): string {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${c},${c},${c})`;
}

export function createCliffFaceCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CLIFF_TEX;
  cv.height = CLIFF_TEX;
  const ctx = cv.getContext('2d')!;
  const rand = rnd(0x5eed13);
  const rowH = CLIFF_TEX / ROWS;

  ctx.fillStyle = gray(0.46);
  ctx.fillRect(0, 0, CLIFF_TEX, CLIFF_TEX);

  const block = (x: number, y0: number, w: number, shade: number): void => {
    for (const off of [0, -CLIFF_TEX]) {
      const bx = x + off;
      if (bx >= CLIFF_TEX || bx + w <= 0) continue;
      ctx.fillStyle = gray(shade);
      ctx.fillRect(bx, y0 + 2, w, rowH - 4);
      ctx.fillStyle = gray(Math.min(1, shade * 1.16));
      ctx.fillRect(bx, y0 + 1, w, 2);
      ctx.fillStyle = gray(shade * 0.5);
      ctx.fillRect(bx + w - 1, y0 + 1, 1, rowH - 2);
    }
  };

  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rowH;
    let x = -(2 + Math.floor(rand() * 8));
    while (x < CLIFF_TEX) {
      const w = 12 + Math.floor(rand() * 10);          // 12..21 px
      block(x, y0, w, 0.80 + rand() * 0.20);
      x += w;
    }
    ctx.fillStyle = gray(0.34);
    ctx.fillRect(0, y0 + rowH - 1, CLIFF_TEX, 1);
  }

  for (let i = 0; i < 32; i++) {
    ctx.fillStyle = gray(0.5 + rand() * 0.14);
    ctx.fillRect(Math.floor(rand() * CLIFF_TEX), Math.floor(rand() * CLIFF_TEX), 1, 1);
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = gray(0.92 + rand() * 0.08);
    ctx.fillRect(Math.floor(rand() * CLIFF_TEX), Math.floor(rand() * CLIFF_TEX), 1, 1);
  }

  return cv;
}
