/* waterfall-texture.ts — процедурная текстура водопада ручья.
 *
 * Раньше грань водопада брала тайл воды из атласа земли и накладывала его
 * пояс за поясом на всю высоту перепада: стена получалась серой с белыми
 * полосами, и спуск воды читался как «течёт по уступам», а не как падение.
 *
 * Здесь свой холст: тело потока (синие вертикальные струи со светлыми
 * прожилками) и полоса пены, которая ставится у основания падения.
 *
 * UV (см. addWaterfall в terrain-mesh.ts):
 *   v 0 .. FALL_FOAM_V  — пена у основания;
 *   v FALL_FOAM_V .. 1  — тело потока.
 */

/** Сторона тайла текстуры водопада. */
export const FALL_TEX = 16;

/** Доля текстуры по v, занятая пеной у основания потока. */
export const FALL_FOAM_V = 0.25;

/** Детерминированный ГПСЧ (mulberry32) — текстура одинакова между запусками. */
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

/**
 * Холст водопада: сверху тело потока, снизу — пена.
 *
 * Струи рисуются с переносом через край тайла, поэтому текстура тайлится по
 * горизонтали и не даёт видимого шва на широких падениях.
 */
export function createWaterfallCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FALL_TEX;
  cv.height = FALL_TEX;
  const ctx = cv.getContext('2d')!;
  const rand = rnd(0xfa11);

  // Границы областей в пикселях холста (canvas: y вниз, v — вверх).
  const foamH = Math.round(FALL_TEX * FALL_FOAM_V);
  const bodyTop = 0;
  const bodyBottom = FALL_TEX - foamH;

  // ── Тело потока ──
  ctx.fillStyle = rgb(62, 108, 168);
  ctx.fillRect(0, bodyTop, FALL_TEX, bodyBottom - bodyTop);

  /** Вертикальная струя шириной 1–3 px, с переносом через край тайла. */
  const streak = (x: number, w: number, color: string): void => {
    for (const off of [0, -FALL_TEX]) {
      const bx = x + off;
      if (bx >= FALL_TEX || bx + w <= 0) continue;
      ctx.fillStyle = color;
      // Лёгкое дрожание: струя не должна быть линейкой.
      let px = bx;
      for (let y = bodyTop; y < bodyBottom; y++) {
        ctx.fillRect(px, y, w, 1);
        if (rand() < 0.22) px += rand() < 0.5 ? -1 : 1;
        px = ((px % FALL_TEX) + FALL_TEX) % FALL_TEX;
      }
    }
  };

  for (let i = 0; i < 5; i++) {
    streak(Math.floor(rand() * FALL_TEX), 1 + Math.floor(rand() * 2), rgb(96, 148, 208));
  }
  for (let i = 0; i < 3; i++) {
    streak(Math.floor(rand() * FALL_TEX), 1 + Math.floor(rand() * 2), rgb(148, 194, 232));
  }
  // Белые брызги внутри потока.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgb(226, 240, 252);
    ctx.fillRect(Math.floor(rand() * FALL_TEX), bodyTop + Math.floor(rand() * (bodyBottom - bodyTop)), 1, 1);
  }

  // ── Пена у основания ──
  ctx.fillStyle = rgb(232, 242, 251);
  ctx.fillRect(0, bodyBottom, FALL_TEX, foamH);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rand() * FALL_TEX);
    const y = bodyBottom + Math.floor(rand() * foamH);
    ctx.fillStyle = rand() < 0.5 ? rgb(178, 212, 240) : rgb(255, 255, 255);
    ctx.fillRect(x, y, 1 + Math.floor(rand() * 2), 1);
  }

  return cv;
}
