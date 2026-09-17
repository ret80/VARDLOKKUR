/* renderers/core/primitives.ts — общие pixel-примитивы отрисовки (SOLID: SRP) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';

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
export function drawRect(g: GraphicsHandle, x: number, y: number, w: number, h: number, c: { r: number; g: number; b: number; a: number }): void {
  const r = getRenderer();
  r.drawRect(g, { x, y, width: w, height: h }, c);
}

/** Нарисовать эллипс */
export function drawEllipse(g: GraphicsHandle, cx: number, cy: number, rx: number, ry: number, c: { r: number; g: number; b: number; a: number }): void {
  const r = getRenderer();
  r.drawEllipse(g, cx, cy, rx, ry, c);
}

/** Нарисовать полигон (точки: [x1,y1, x2,y2, ...]) */
export function drawPoly(g: GraphicsHandle, points: number[], c: { r: number; g: number; b: number; a: number }): void {
  const r = getRenderer();
  r.drawPoly(g, points, c);
}

/** Очистить графику */
export function clearGraphics(g: GraphicsHandle): void {
  const r = getRenderer();
  r.clearGraphics(g);
}

/** Прямоугольник-пиксель */
export function px(g: GraphicsHandle, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  drawRect(g, x, y, w, h, hexToColor(c, a));
}

/** Эллипс */
export function ell(g: GraphicsHandle, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  drawEllipse(g, x, y, rw, rh, hexToColor(c, a));
}

/** Окружность-заливка */
export function circ(g: GraphicsHandle, x: number, y: number, r: number, c: number, a = 1): void {
  drawEllipse(g, x, y, r, r, hexToColor(c, a));
}

/** Обводка окружности (approximated через drawEllipse — ring не используется в текущих рендерерах активно) */
export function ring(g: GraphicsHandle, x: number, y: number, r: number, c: number, w = 1, a = 1): void {
  drawEllipse(g, x, y, r, r, hexToColor(c, a));
}
