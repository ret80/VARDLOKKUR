/* wall-geom.ts — геометрическая отрисовка стен/деревьев/камней (task_14).
 *
 * Перенос legacy paintWall() из tiles.ts: вместо Canvas2D — Graphics-примитивы
 * через PixelPainter. Символы P (прямоугольник) сохранены 1-в-1.
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { Tl } from '../world';
import { makePainter } from './geom-utils';

/**
 * Маска соединений PALISADE в битах variant (SVG/polisade.svg):
 *   bit0=N, bit1=E, bit2=S, bit3=W — сосед тоже PALISADE.
 */
export const FENCE_N = 1;
export const FENCE_E = 2;
export const FENCE_S = 4;
export const FENCE_W = 8;

type RectFn = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;

/** Колышек горизонтального пролёта (SVG ph): 3px, остриё сверху, тело 13px. */
function picketH(P: RectFn, x: number): void {
  P(x + 1, 1, 1, 1, 0x6e5840); // остриё
  P(x, 2, 3, 13, 0x4e3c28); // тело
  P(x, 2, 1, 13, 0x63503a); // свет
  P(x + 2, 2, 1, 13, 0x3a2c1c); // тень
}

/** Двойные горизонтальные перила [x0, x1) на высоте пояса. */
function railH(P: RectFn, x0: number, x1: number): void {
  const w = x1 - x0;
  if (w <= 0) return;
  P(x0, 6, w, 1, 0x5a4632);
  P(x0, 7, w, 1, 0x463626);
  P(x0, 10, w, 1, 0x5a4632);
  P(x0, 11, w, 1, 0x463626);
}

/** Один вертикальный кол (SVG pv): остриё, воротник, тело 3px высотой bodyH. */
function stakeV(P: RectFn, x: number, yCollar: number, bodyH: number): void {
  P(x + 1, yCollar - 1, 1, 1, 0x6e5840); // остриё
  P(x, yCollar, 3, 1, 0x5a4632); // воротник
  P(x, yCollar + 1, 1, bodyH, 0x63503a); // свет
  P(x + 1, yCollar + 1, 1, bodyH, 0x4e3c28); // тело
  P(x + 2, yCollar + 1, 1, bodyH, 0x3a2c1c); // тень
}

/**
 * Частокол по маске соединений: прямые H/V, углы и Т-стыки.
 * Формы повторяют SVG/polisade.svg (ph, pv, ce, cw).
 */
function drawPalisade(P: RectFn, mask: number): void {
  const n = (mask & FENCE_N) !== 0;
  const e = (mask & FENCE_E) !== 0;
  const s = (mask & FENCE_S) !== 0;
  const w = (mask & FENCE_W) !== 0;
  const vConn = n || s;
  const hConn = e || w;

  // Перила — только к подключённым горизонтальным сторонам.
  if (e && w) railH(P, 0, 16);
  else if (e) railH(P, 6, 16);
  else if (w) railH(P, 0, 10);

  // Колышки: прямой пролёт — 4 (ph), угол/торец — один столб у края.
  if (e && w) {
    for (let i = 0; i < 4; i++) picketH(P, 1 + i * 4);
  } else if (e) {
    picketH(P, 12);
  } else if (w) {
    picketH(P, 1);
  }

  // Колья (pv): при вертикальном соединении, а также у одиночного столба.
  if (vConn || !hConn) {
    stakeV(P, 6, 1, 10);
    stakeV(P, 7, 9, 6);
  }
}

/**
 * Нарисовать стену/объект типа t (TREE/ROCK/PALISADE/COLUMN/DWALL/CAVEWALL)
 * в локальных координатах Graphics (как в legacy: блок P(0..16, -13..16),
 * спрайт размещался со сдвигом (-8, -20) от тайла).
 *
 * @param variant   детерминированный вариант (биты 1,2: форма/зеркало);
 *                  для PALISADE — маска соединений N/E/S/W (FENCE_*)
 * @param dungeonId id подземелья (палитра DWALL)
 * @param ox,oy     смещение для батчинга (когда один Graphics на все стены)
 * @param snow      рисовать снег (для деревьев/камней в снежном биоме)
 *
 * ВАЖНО: спрайты TREE/DEADTREE/FIR/GRASS рисуются с ПИВОТОМ В ОСНОВАНИИ —
 * локальные (0,0) это низ ствола/пучка, объект растёт вверх (отрицательный y).
 * Вызывающий обязан поставить Graphics в точку основания (центр тайла + офсет).
 * Остальные спрайты (ROCK/PALISADE/COLUMN/DWALL/CAVEWALL) — как раньше,
 * от левого-верхнего угла тайла.
 */
export function drawWallGeometry(
  renderer: IRenderer,
  g: GraphicsHandle,
  t: number,
  variant: number,
  dungeonId: number,
  ox = 0,
  oy = 0,
  snow = false
): void {
  const { P } = makePainter(renderer, g);

  // Helper с учётом смещения для батчинга
  const P2 = (x: number, y: number, w: number, h: number, c: number, a?: number) =>
    P(x + ox, y + oy, w, h, c, a);

  const v = variant;

  switch (t) {
    case Tl.TREE:
    case Tl.DEADTREE:
    case Tl.FIR: {
      // Пивот в основании: (0,0) = низ ствола. Зеркало вокруг центра спрайта (x=8).
      const TX = (x: number, w: number) => (v & 2 ? 16 - x - w : x) - 8;
      const TY = (y: number) => y - 16;
      // DEADTREE — всегда голое дерево; FIR — всегда ель; TREE — вариант по v
      const fir = t === Tl.FIR ? true : t === Tl.DEADTREE ? false : (v & 1) !== 0;
      if (fir) {
        // ===== ЕЛЬ =====
        P2(TX(7, 3), TY(4), 3, 12, 0x241d14); P2(TX(7, 1), TY(4), 1, 12, 0x2f2618);
        // ярус 1
        P2(TX(3, 11), TY(2), 11, 3, 0x1d2b22);
        if (snow) {
          P2(TX(4, 3), TY(2), 3, 1, 0xc8d3dc); P2(TX(9, 2), TY(2), 2, 1, 0xc8d3dc);
          P2(TX(12, 1), TY(3), 1, 1, 0xc8d3dc); P2(TX(3, 1), TY(4), 1, 1, 0xc8d3dc);
        }
        // ярус 2
        P2(TX(4, 9), TY(-2), 9, 3, 0x24352a);
        if (snow) {
          P2(TX(6, 2), TY(-2), 2, 1, 0xc8d3dc); P2(TX(9, 2), TY(-2), 2, 1, 0xc8d3dc);
          P2(TX(4, 1), TY(-1), 1, 1, 0xc8d3dc);
        }
        // ярус 3
        P2(TX(5, 7), TY(-6), 7, 3, 0x1d2b22);
        if (snow) {
          P2(TX(5, 1), TY(-6), 1, 1, 0xc8d3dc); P2(TX(7, 2), TY(-6), 2, 1, 0xc8d3dc);
          P2(TX(10, 1), TY(-5), 1, 1, 0xc8d3dc);
        }
        // ярус 4
        P2(TX(6, 5), TY(-10), 5, 3, 0x24352a);
        if (snow) { P2(TX(7, 2), TY(-10), 2, 1, 0xc8d3dc); P2(TX(9, 1), TY(-9), 1, 1, 0xc8d3dc); }
        // верхушка
        P2(TX(7, 3), TY(-13), 3, 3, 0x1d2b22);
        if (snow) { P2(TX(8, 1), TY(-13), 1, 1, 0xc8d3dc); P2(TX(7, 1), TY(-12), 1, 1, 0xc8d3dc); }
        // сугроб у основания
        if (snow) P2(TX(6, 5), TY(14), 5, 2, 0x8b98a6);
      } else {
        // ===== ГОЛОЕ ДЕРЕВО (лиственное без кроны) =====
        // ствол (доходит до основания)
        P2(TX(6, 3), TY(1), 3, 14, 0x3a2c1c);
        P2(TX(6, 3), TY(1), 1, 14, 0x4e3c28);
        // левая ветвь (каждый сегмент стыкуется с предыдущим)
        P2(TX(5, 2), TY(0), 2, 2, 0x3a2c1c);
        P2(TX(3, 2), TY(-2), 2, 2, 0x3a2c1c);
        P2(TX(2, 2), TY(-3), 2, 1, 0x3a2c1c);
        P2(TX(1, 2), TY(-4), 2, 1, 0x3a2c1c);
        // правая ветвь
        P2(TX(9, 2), TY(0), 2, 2, 0x3a2c1c);
        P2(TX(11, 2), TY(-2), 2, 2, 0x3a2c1c);
        P2(TX(12, 2), TY(-3), 2, 1, 0x3a2c1c);
        P2(TX(13, 2), TY(-4), 2, 1, 0x3a2c1c);
        // верхушка
        P2(TX(7, 1), TY(-4), 1, 5, 0x3a2c1c);
        P2(TX(7, 1), TY(-6), 1, 2, 0x3a2c1c);
        P2(TX(8, 1), TY(-5), 1, 2, 0x3a2c1c);
        if (snow) {
          // снег на ветвях
          P2(TX(1, 3), TY(-5), 3, 1, 0xeef6fc);
          P2(TX(3, 2), TY(-3), 2, 1, 0xc8d3dc);
          P2(TX(5, 2), TY(-1), 2, 1, 0xc8d3dc);
          P2(TX(13, 2), TY(-5), 2, 1, 0xeef6fc);
          P2(TX(11, 2), TY(-3), 2, 1, 0xc8d3dc);
          P2(TX(9, 2), TY(-1), 2, 1, 0xc8d3dc);
          P2(TX(6, 3), TY(-7), 3, 1, 0xeef6fc); // снежная шапка верхушки
          P2(TX(6, 3), TY(0), 3, 1, 0xc8d3dc);  // снег на "плечах" развилки
          // сугроб у основания
          P2(TX(4, 7), TY(14), 7, 2, 0x8b98a6);
        }
      }
      break;
    }
    case Tl.GRASS: {
      // Пивот в основании (0,0) = низ пучка. Зеркало вокруг центра (x=0.5).
      const GX = (x: number, w: number) => (v & 2 ? 2 - x - w : x);
      // объёмный пучок травы ~11px в высоту (луг)
      P2(GX(-3, 7), -1, 7, 1, 0x2a320f, 0.5); // мягкая тень у корней
      P2(GX(-3, 1), -7, 1, 7, 0x364807);      // наружные тёмные
      P2(GX(4, 1), -6, 1, 6, 0x364807);
      P2(GX(-2, 1), -10, 1, 10, 0x44580b);    // средние
      P2(GX(3, 1), -8, 1, 8, 0x44580b);
      P2(GX(-1, 1), -6, 1, 6, 0x475816);
      P2(GX(2, 1), -9, 1, 9, 0x475816);
      P2(GX(0, 1), -11, 1, 11, 0x566727);     // центральные высокие
      P2(GX(1, 1), -7, 1, 7, 0x6a7647);
      break;
    }
    case Tl.ROCK:
      P2(2, 5, 12, 10, 0x4e5a68);
      P2(3, 4, 10, 4, 0x5c6875);
      P2(2, 12, 12, 3, 0x39424e);
      if (v & 1) P2(4, 4, 2, 1, 0x8f9aa8);
      if (snow) { P2(3, 4, 10, 2, 0xdbe5ee); P2(5, 3, 6, 1, 0xeef4f9); }
      break;
    case Tl.PALISADE:
      // variant = маска соединений (N/E/S/W), см. drawPalisade.
      drawPalisade(P2, v);
      break;
    case Tl.COLUMN: {
      P2(5, -10, 7, 24, 0x515d6a);
      P2(5, -10, 2, 24, 0x62707e);
      P2(11, -10, 1, 24, 0x3f4a56);
      P2(6, -12, 5, 2, 0x5c6875);
      P2(7, -13, 3, 1, 0x6a7580);
      const rune = v & 1 ? 0x8fd8e8 : 0x7a8a98;
      P2(8, -6, 1, 2, rune); P2(9, -4, 1, 2, rune); P2(8, -2, 2, 1, rune); P2(9, 1, 1, 2, rune);
      P2(4, 12, 9, 2, 0x39424e);
      P2(4, 12, 9, 1, 0x8b98a6);
      if (v & 2) P2(10, 5, 2, 3, 0x2e4234);
      break;
    }
    case Tl.DWALL: {
      const dark = dungeonId === 1 ? 0x1c261c : dungeonId === 2 ? 0x2c2824 : 0x10151c;
      const light = dungeonId === 1 ? 0x2c362c : dungeonId === 2 ? 0x3a342e : 0x232c38;
      P2(0, 0, 16, 16, dark);
      P2(0, 0, 16, 5, light);
      P2(1, 9, 4, 4, 0x0a0e14); P2(9, 7, 5, 5, 0x0a0e14);
      break;
    }
    case Tl.CAVEWALL:
      P2(0, 0, 16, 16, 0x12181f);
      P2(0, 0, 16, 6, 0x1a222c);
      P2(2, 8, 3, 3, 0x0d1218); P2(10, 10, 3, 3, 0x0d1218);
      break;
  }
}
