/* renderers/drop/BaseDropRenderer.ts — общий скелет отрисовки дропов (SRP)

   Этап 4: мигрирован на Batchers вместо PixiJS Graphics.
*/

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IDropData } from "../../models";

/**
 * Базовый рендерер дропов: bob, ранний выход при taken.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseDropRenderer implements Renderer<IDropData> {
  protected abstract drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void;

  render(b: Batchers, data: IDropData, ctx: RenderContext): void {
    if (data.taken) return;

    const bob = Math.sin(ctx.time * 3 + data.t) * 1.5;
    this.drawBody(b, data, { ...ctx, bob });
  }
}
