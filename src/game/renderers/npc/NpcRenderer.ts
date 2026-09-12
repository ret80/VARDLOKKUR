/* renderers/npc/NpcRenderer.ts — общий скелет отрисовки NPC (SRP)

   Этап 4: мигрирован на Batchers вместо PixiJS Graphics.
*/

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { INpcData } from "../../models";
import { px } from "../core/primitives";

/**
 * Базовый рендерер NPC: тень, bob, mark && blink.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class NpcRenderer implements Renderer<INpcData> {
  protected abstract drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void;

  render(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;

    // общая тень
    b.primitive.pushEllipse(0, 5, 5, 2, 0x05080d, 0.5);

    this.drawBody(b, data, ctx);

    // mark && blink
    const mark = (ctx as any).mark;
    const blink = Math.floor(ctx.time * 2) % 2 === 0;
    if (mark && blink) {
      px(b, -1, -20, 2, 4, 0xe8c979);
      px(b, -1, -15, 2, 2, 0xe8c979);
    }
  }
}
