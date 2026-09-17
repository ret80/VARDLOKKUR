/* renderers/core/primitives.ts — общие pixel-примитивы отрисовки (SOLID: SRP, DIP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';

/** Конвертация hex-цвета (0xRRGGBB) в Color {r, g, b, a} */
function hexToColor(hex: number, alpha: number = 1): { r: number; g: number; b: number; a: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
    a: alpha,
  };
}

/** Нарисовать прямоугольник */
export function drawRect(r: IRenderer, g: GraphicsHandle, x: number, y: number, w: number, h: number, c: { r: number; g: number; b: number; a: number }): void {
  r.drawRect(g, { x, y, width: w, height: h }, c);
}

/** Нарисовать эллипс */
export function drawEllipse(r: IRenderer, g: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, c: { r: number; g: number; b: number; a: number }): void {
  r.drawEllipse(g, cx, cy, rx, ry, c);
}

/** Нарисовать полигон (точки: [x1,y1, x2,y2, ...]) */
export function drawPoly(r: IRenderer, g: GraphicsHandle, points: number[], c: { r: number; g: number; b: number; a: number }): void {
  r.drawPoly(g, points, c);
}

/** Очистить графику */
export function clearGraphics(r: IRenderer, g: GraphicsHandle): void {
  r.clearGraphics(g);
}

/** Прямоугольник-пиксель */
export function px(r: IRenderer, g: GraphicsHandle, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  drawRect(r, g, x, y, w, h, hexToColor(c, a));
}

/** Эллипс */
export function ell(r: IRenderer, g: GraphicsHandle, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  drawEllipse(r, g, x, y, rw, rh, hexToColor(c, a));
}

/** Окружность-заливка */
export function circ(r: IRenderer, g: GraphicsHandle, x: number, y: number, rdx: number, c: number, a = 1): void {
  drawEllipse(r, g, x, y, rdx, rdx, hexToColor(c, a));
}

/** Обводка окружности (approximated через drawEllipse — ring не используется в текущих рендерерах активно) */
export function ring(r: IRenderer, g: GraphicsHandle, x: number, y: number, radius: number, c: number, w = 1, a = 1): void {
  drawEllipse(r, g, x, y, radius, radius, hexToColor(c, a));
}
