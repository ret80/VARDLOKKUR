/* cliff-texture.ts — процедурная текстура вертикальной грани утёса.
 *
 * Раньше грань утёса брала узкую полосу из текстуры земли (4×16 px «камень»
 * вдоль края тайла) и растягивала её на всю высоту стены: на высоких обрывах
 * полоса разъезжалась в серую муть, а слои породы не читались.
 *
 * Здесь рисуется собственная тайловая текстура из крупных блоков породы, как
 * на референсе: на одну террасу (TERRACE_HEIGHT) приходится два ряда кладки,
 * у каждого блока светлая верхняя кромка, тёмный шов справа и тень между
 * рядами. Текстура почти монохромная: цвет задаётся тоном вершин (CLIFF_TINT
 * в terrain-mesh.ts), поэтому один холст обслуживает и землю, и камень.
 */

/** Сторона тайла текстуры: одна терраса = один тайл по UV. */
export const CLIFF_TEX = 16;

/**
 * Рядов блоков в тайле.
 *
 * Два ряда на террасу дают блок высотой ~0.45 мировой единицы при ширине
 * тайла 1.0 — крупная кладка, как на референсе. Прежние четыре ряда читались
 * как мелкая крошка и на стене терялись.
 */
const ROWS = 2;

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
 * Холст текстуры грани: ROWS рядов кладки, тайлится по обеим осям.
 *
 * Блок: тело со случайной яркостью, светлая верхняя кромка, тёмный шов справа
 * и тень по низу ряда. Блоки рисуются с переносом через край тайла, поэтому
 * шов на стыке не виден.
 */
export function createCliffFaceCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CLIFF_TEX;
  cv.height = CLIFF_TEX;
  const ctx = cv.getContext('2d')!;
  const rand = rnd(0x5eed13);
  const rowH = CLIFF_TEX / ROWS;

  // Подложка — самый тёмный тон кладки: щели между блоками.
  ctx.fillStyle = gray(0.46);
  ctx.fillRect(0, 0, CLIFF_TEX, CLIFF_TEX);

  /** Блок кладки с переносом через край тайла. */
  const block = (x: number, y0: number, w: number, shade: number): void => {
    for (const off of [0, -CLIFF_TEX]) {
      const bx = x + off;
      if (bx >= CLIFF_TEX || bx + w <= 0) continue;
      ctx.fillStyle = gray(shade);
      ctx.fillRect(bx, y0 + 2, w, rowH - 3);
      // Светлая верхняя кромка — блок «выступает» из кладки.
      ctx.fillStyle = gray(Math.min(1, shade * 1.16));
      ctx.fillRect(bx, y0 + 1, w, 1);
      // Тёмный шов справа.
      ctx.fillStyle = gray(shade * 0.5);
      ctx.fillRect(bx + w - 1, y0 + 1, 1, rowH - 2);
    }
  };

  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rowH;
    // Сдвиг кладки между рядами — иначе швы встают в одну линию.
    let x = -(1 + Math.floor(rand() * 5));
    while (x < CLIFF_TEX) {
      const w = 6 + Math.floor(rand() * 5);          // 6..10 px
      block(x, y0, w, 0.80 + rand() * 0.20);
      x += w;
    }
    // Горизонтальный шов между рядами.
    ctx.fillStyle = gray(0.34);
    ctx.fillRect(0, y0 + rowH - 1, CLIFF_TEX, 1);
  }

  // Порода: редкие тёмные выбоины и светлые крапины, чтобы стена не была
  // «пластиковой».
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = gray(0.5 + rand() * 0.14);
    ctx.fillRect(Math.floor(rand() * CLIFF_TEX), Math.floor(rand() * CLIFF_TEX), 1, 1);
  }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = gray(0.92 + rand() * 0.08);
    ctx.fillRect(Math.floor(rand() * CLIFF_TEX), Math.floor(rand() * CLIFF_TEX), 1, 1);
  }

  return cv;
}
