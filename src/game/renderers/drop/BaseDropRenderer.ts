/* renderers/drop/BaseDropRenderer.ts — общий скелет отрисовки дропов (SRP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IDropData } from "../../models";

/**
 * Базовый рендерер дропов: bob, ранний выход при taken.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseDropRenderer implements Renderer<IDropData> {
  protected abstract drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void;

  render(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    r.clearGraphics(g);
    if (data.taken) return;

    const bob = Math.sin(ctx.time * 3 + data.t) * 1.5;
    this.drawBody(g, data, { ...ctx, bob });
  }
}
