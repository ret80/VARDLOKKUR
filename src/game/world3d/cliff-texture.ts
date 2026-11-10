/* cliff-texture.ts — процедурная текстура вертикальной грани утёса.
 *
 * Раньше грань утёса брала узкую полосу из текстуры земли (4×16 px «камень»
 * вдоль края тайла) и растягивала её на всю высоту стены: на высоких обрывах
 * полоса разъезжалась в серую муть, а слои породы не читались.
 *
 * Здесь рисуется собственная тайловая текстура из блоков породы — как на
 * референсе: ряды «плит», у каждого светлая верхняя кромка, тень снизу и
 * вертикальные швы со сдвигом. Текстура серая: тон биома задаётся цветом
 * вершин (см. CLIFF_TINT в terrain-mesh.ts), поэтому один холст обслуживает
 * снег, лес, топи и гору.
 */

/** Сторона тайла текстуры: одна терраса = один тайл по UV. */
export const CLIFF_TEX = 16;

/** Рядов блоков в тайле. */
const ROWS = 4;

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

/** Серый тон в CSS-цвет (текстура монохромная, цвет приходит из вершин). */
function gray(v: number): string {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${c},${c},${c})`;
}

/**
 * Холст текстуры грани: ROWS рядов блоков, тайлится по обеим осям.
 *
 * Каждый ряд — плита: 1 px светлой верхней кромки, тело со случайной
 * яркостью по блокам, 1 px тени снизу, вертикальные швы через 4–7 px со
 * сдвигом между рядами. Так стена читается как кладка, а не как заливка.
 */
export function createCliffFaceCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CLIFF_TEX;
  cv.height = CLIFF_TEX;
  const ctx = cv.getContext('2d')!;
  const rand = rnd(0x5eed13);
  const rowH = CLIFF_TEX / ROWS;

  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rowH;

    // Тело ряда: случайная яркость блоков, швы со сдвигом.
    let x = 0;
    const shift = Math.floor(rand() * 5);
    while (x < CLIFF_TEX) {
      const w = 4 + Math.floor(rand() * 4);          // 4..7 px
      const shade = 0.80 + rand() * 0.20;
      ctx.fillStyle = gray(shade);
      ctx.fillRect(x + shift, y0 + 1, w - 1, rowH - 2);
      // Шов блока — тёмная вертикаль (переносим через край тайла).
      ctx.fillStyle = gray(shade * 0.62);
      ctx.fillRect((x + shift + w - 1) % CLIFF_TEX, y0 + 1, 1, rowH - 2);
      x += w;
    }

    // Светлая кромка сверху и тень снизу — «плита» получает объём.
    ctx.fillStyle = gray(1);
    ctx.fillRect(0, y0, CLIFF_TEX, 1);
    ctx.fillStyle = gray(0.30);
    ctx.fillRect(0, y0 + rowH - 1, CLIFF_TEX, 1);
  }

  // Крупный шум: редкие тёмные крапины, чтобы стена не была «пластиковой».
  for (let i = 0; i < 18; i++) {
    const px = Math.floor(rand() * CLIFF_TEX);
    const py = Math.floor(rand() * CLIFF_TEX);
    ctx.fillStyle = gray(0.5 + rand() * 0.2);
    ctx.fillRect(px, py, 1, 1);
  }

  return cv;
}
