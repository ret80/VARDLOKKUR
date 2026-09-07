/* renderers/drop/BaseDropRenderer.ts — общий скелет отрисовки дропов (SRP) */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IDropData } from "../../models";

/**
 * Базовый рендерер дропов: bob, ранний выход при taken.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseDropRenderer implements Renderer<IDropData> {
  protected abstract drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void;

  render(g: Graphics, data: IDropData, ctx: RenderContext): void {
    g.clear();
    if (data.taken) return;

    const bob = Math.sin(ctx.time * 3 + data.t) * 1.5;
    this.drawBody(g, data, { ...ctx, bob });
  }
}
