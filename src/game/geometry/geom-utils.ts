/* geom-utils.ts — общие хелперы геометрической отрисовки (task_14).
 *
 * Вся графика рисуется исключительно Graphics-примитивами IRenderer
 * (drawRect/drawPoly/drawEllipse), без текстур и canvas.
 */

import type { IRenderer, GraphicsHandle, Color } from '../renderer/IRenderer';

/** Конвертировать 24-битный hex-цвет в нормализованный Color (0..1) */
export function rgb(c: number, a = 1): Color {
  return {
    r: ((c >> 16) & 0xff) / 255,
    g: ((c >> 8) & 0xff) / 255,
    b: (c & 0xff) / 255,
    a,
  };
}

/** Прототип пиксельного блока P(x, y, w, h, color, alpha) из legacy paint*-функций */
export interface PixelPainter {
  /** Залить прямоугольник цветом c (hex 0xRRGGBB) с альфой a */
  P(x: number, y: number, w: number, h: number, c: number, a?: number): void;
  /** Нарисовать залитый круг (для окон/линз домов) */
  C(x: number, y: number, r: number, c: number, a?: number): void;
  /** Нарисовать залитый многоугольник pts=[x1,y1,...] */
  POLY(pts: number[], c: number, a?: number): void;
}

/** Создать painter поверх GraphicsHandle через IRenderer */
export function makePainter(renderer: IRenderer, handle: GraphicsHandle): PixelPainter {
  return {
    P: (x, y, w, h, c, a = 1) => renderer.drawRect(handle, { x, y, width: w, height: h }, rgb(c, a)),
    C: (x, y, r, c, a = 1) => renderer.drawEllipse(handle, x, y, r, r, rgb(c, a)),
    POLY: (pts, c, a = 1) => renderer.drawPoly(handle, pts, rgb(c, a)),
  };
}

/** Детерминированный псевдослучайный шум (как в legacy tiles.ts) */
export const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
