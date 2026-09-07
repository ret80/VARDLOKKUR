/* renderers/npc/NpcRenderer.ts — общий скелет отрисовки NPC (SRP) */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { INpcData } from "../../models";
import { px } from "../core/primitives";

/**
 * Базовый рендерер NPC: тень, bob, mark && blink.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class NpcRenderer implements Renderer<INpcData> {
  protected abstract drawBody(g: Graphics, data: INpcData, ctx: RenderContext): void;

  render(g: Graphics, data: INpcData, ctx: RenderContext): void {
    g.clear();
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;

    // общая тень
    g.ellipse(0, 5, 5, 2).fill({ color: 0x05080d, alpha: 0.5 });

    this.drawBody(g, data, ctx);

    // mark && blink
    const mark = (ctx as any).mark;
    const blink = Math.floor(ctx.time * 2) % 2 === 0;
    if (mark && blink) {
      px(g, -1, -20, 2, 4, 0xe8c979);
      px(g, -1, -15, 2, 2, 0xe8c979);
    }
  }
}
