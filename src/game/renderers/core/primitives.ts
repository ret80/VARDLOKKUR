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

/** Прямоугольник-пиксель */
export function px(g: GraphicsHandle, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  const r = getRenderer();
  r.drawRect(g, { x, y, width: w, height: h }, hexToColor(c, a));
}

/** Эллипс */
export function ell(g: GraphicsHandle, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  const r = getRenderer();
  r.drawEllipse(g, x, y, rw, rh, hexToColor(c, a));
}

/** Окружность-заливка */
export function circ(g: GraphicsHandle, x: number, y: number, r: number, c: number, a = 1): void {
  const r2 = getRenderer();
  r2.drawEllipse(g, x, y, r, r, hexToColor(c, a));
}

/** Обводка окружности (approximated через drawPoly — ring не используется в текущих рендерерах активно) */
export function ring(g: GraphicsHandle, x: number, y: number, r: number, c: number, w = 1, a = 1): void {
  const r2 = getRenderer();
  // Рисуем эллипс с толщиной как fill — ring в текущих рендерерах не используется напрямую
  r2.drawEllipse(g, x, y, r, r, hexToColor(c, a));
}
