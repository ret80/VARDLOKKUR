/* renderers/core/primitives.ts — общие pixel-примитивы отрисовки (SOLID: SRP) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Graphics } from 'pixi.js';

/** Контекст для рисования: GraphicsHandle (IRenderer path) или PixiJS Graphics (legacy path) */
export type DrawTarget = GraphicsHandle | Graphics;

/** Проверить, является ли target PixiJS Graphics (legacy path) */
function isPixiGraphics(target: DrawTarget): target is Graphics {
  return typeof target === 'object' && (target as Graphics).rect !== undefined;
}

/** Конвертация hex-цвета (0xRRGGBB) в Color {r, g, b, a} */
function hexToColor(hex: number, alpha: number = 1): { r: number; g: number; b: number; a: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
    a: alpha,
  };
}

/** Нарисовать прямоугольник — работает с GraphicsHandle и PixiJS Graphics */
function drawRect(g: DrawTarget, x: number, y: number, w: number, h: number, c: { r: number; g: number; b: number; a: number }): void {
  const colorHex = ((Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255)) as number;
  if (isPixiGraphics(g)) {
    g.rect(x, y, w, h).fill({ color: colorHex, alpha: c.a });
  } else {
    const r = getRenderer();
    r.drawRect(g, { x, y, width: w, height: h }, c);
  }
}

/** Нарисовать эллипс — работает с GraphicsHandle и PixiJS Graphics */
function drawEllipse(g: DrawTarget, cx: number, cy: number, rx: number, ry: number, c: { r: number; g: number; b: number; a: number }): void {
  const colorHex = ((Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255)) as number;
  if (isPixiGraphics(g)) {
    g.ellipse(cx, cy, rx, ry).fill({ color: colorHex, alpha: c.a });
  } else {
    const r = getRenderer();
    r.drawEllipse(g, cx, cy, rx, ry, c);
  }
}

/** Очистить графику — работает с GraphicsHandle и PixiJS Graphics */
export function clearGraphics(g: DrawTarget): void {
  if (isPixiGraphics(g)) {
    g.clear();
  } else {
    const r = getRenderer();
    r.clearGraphics(g);
  }
}

/** Прямоугольник-пиксель */
export function px(g: DrawTarget, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  drawRect(g, x, y, w, h, hexToColor(c, a));
}

/** Эллипс */
export function ell(g: DrawTarget, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  drawEllipse(g, x, y, rw, rh, hexToColor(c, a));
}

/** Окружность-заливка */
export function circ(g: DrawTarget, x: number, y: number, r: number, c: number, a = 1): void {
  drawEllipse(g, x, y, r, r, hexToColor(c, a));
}

/** Обводка окружности (approximated через drawEllipse — ring не используется в текущих рендерерах активно) */
export function ring(g: DrawTarget, x: number, y: number, r: number, c: number, w = 1, a = 1): void {
  drawEllipse(g, x, y, r, r, hexToColor(c, a));
}
