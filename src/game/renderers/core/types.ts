/* renderers/core/types.ts — единый контракт всех рендереров (SOLID: DIP) */

import type { Graphics } from "pixi.js";

/** Контекст, общий для всех рендереров */
export interface RenderContext {
  time: number;
  [key: string]: unknown;
}

/**
 * Единый интерфейс рендерера: один класс = отрисовка одного объекта.
 * Оркестратор (RenderSystem) зависит только от этого интерфейса и реестра,
 * а не от конкретных классов.
 */
export interface Renderer<TData> {
  render(g: Graphics, data: TData, ctx: RenderContext): void;
}