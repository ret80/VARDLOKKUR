/* renderers/core/primitives.ts — общие pixel-примитивы отрисовки (SOLID: SRP) */

import type { Graphics } from "pixi.js";

/** Прямоугольник-пиксель */
export function px(g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  g.rect(x, y, w, h).fill({ color: c, alpha: a });
}

/** Эллипс */
export function ell(g: Graphics, x: number, y: number, rw: number, rh: number, c: number, a = 1): void {
  g.ellipse(x, y, rw, rh).fill({ color: c, alpha: a });
}

/** Окружность-заливка */
export function circ(g: Graphics, x: number, y: number, r: number, c: number, a = 1): void {
  g.circle(x, y, r).fill({ color: c, alpha: a });
}

/** Обводка окружности */
export function ring(g: Graphics, x: number, y: number, r: number, c: number, w = 1, a = 1): void {
  g.circle(x, y, r).stroke({ color: c, width: w, alpha: a });
}