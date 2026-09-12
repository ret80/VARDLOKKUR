/* renderers/core/types.ts — единый контракт всех рендереров (SOLID: DIP)

   Этап 4: удалена зависимость от PixiJS.
   - render() теперь принимает Batchers вместо Graphics
   - renderToContainer / needsTextureUpdate / CacheStrategy удалены
   - Всё рендерится в реальном времени через PrimitiveBatcher / SpriteBatcher
*/

import type { Batchers } from '../../engine/batcher-types.js';

/** Контекст, общий для всех рендереров */
export interface RenderContext {
  time: number;
  [key: string]: unknown;
}

/**
 * Единый интерфейс рендерера: один класс = отрисовка одного объекта.
 *
 * Этап 4: сигнатура изменена на render(batchers, data, ctx).
 * Все рендереры рисуют напрямую в PrimitiveBatcher / SpriteBatcher.
 */
export interface Renderer<TData> {
  /** Основная metoda отрисовки в батчеры (REALTIME_GRAPHICS) */
  render(batchers: Batchers, data: TData, ctx: RenderContext): void;
}
