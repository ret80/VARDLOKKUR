/* renderers/core/primitives.ts — общие pixel-примитивы отрисовки (SOLID: SRP)

   Этап 4: мигрированы на Batchers вместо PixiJS Graphics.
   Все функции рисуют напрямую в PrimitiveBatcher.
*/

import type { Batchers } from '../../engine/batcher-types.js';

/** Прямоугольник-пиксель */
export function px(b: Batchers, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  b.primitive.pushRect(x, y, w, h, color, alpha);
}

/** Эллипс */
export function ell(b: Batchers, x: number, y: number, rw: number, rh: number, color: number, alpha = 1): void {
  b.primitive.pushEllipse(x, y, rw, rh, color, alpha);
}

/** Окружность-заливка */
export function circ(b: Batchers, x: number, y: number, r: number, color: number, alpha = 1): void {
  b.primitive.pushCircle(x, y, r, color, alpha);
}

/** Обводка окружности */
export function ring(b: Batchers, x: number, y: number, r: number, color: number, width = 1, alpha = 1): void {
  b.primitive.pushCircleStroke(x, y, r, width, color, alpha);
}
