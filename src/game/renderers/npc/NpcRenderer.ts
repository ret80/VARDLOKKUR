/* renderers/npc/NpcRenderer.ts — общий скелет отрисовки NPC (SRP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { INpcData } from "../../models";
import { px } from "../core/primitives";

/**
 * Базовый рендерер NPC: тень, bob, mark && blink.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class NpcRenderer implements Renderer<INpcData> {
  protected abstract drawBody(g: GraphicsHandle, data: INpcData, ctx: RenderContext): void;

  render(g: GraphicsHandle, data: INpcData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    r.clearGraphics(g);
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;

    // общая тень
    r.drawEllipse(g, 0, 5, 5, 2, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 });

    this.drawBody(g, data, ctx);

    // mark && blink
    const mark = (ctx as any).mark;
    const blink = Math.floor(ctx.time * 2) % 2 === 0;
    if (mark && blink) {
      px(r, g, -1, -20, 2, 4, 0xe8c979);
      px(r, g, -1, -15, 2, 2, 0xe8c979);
    }
  }
}
