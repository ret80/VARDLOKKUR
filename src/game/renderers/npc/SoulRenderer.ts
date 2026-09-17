/* renderers/npc/SoulRenderer.ts */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { drawPoly, px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class SoulRenderer extends NpcRenderer {
  protected drawBody(g: GraphicsHandle, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const time = ctx.time;
    const fl = Math.sin(time * 2.4) * 2.5;
    const a = 0.5 + Math.sin(time * 3.1) * 0.15;
    const r: IRenderer = ctx.renderer!;
    // Душа — полигон
    drawPoly(r, g, [-4, 2 + fl, 0, 8 + fl, 4, 2 + fl, 2, 3 + fl, 0, 6 + fl, -2, 3 + fl], { r: 0x8f / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: a * 0.5 });
    px(r, g, -4, -8 + fl, 9, 10, 0x8fd8e8, a * 0.75);
    px(r, g, -3, -11 + fl, 7, 4, 0xbdeef8, a);
    px(r, g, -2, -9 + fl, 2, 2, 0x0d1a24, a);
    px(r, g, 1, -9 + fl, 2, 2, 0x0d1a24, a);
    r.drawEllipse(g, 0, -4 + fl, 8, 8, { r: 0x8f / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: a * 0.35 });
  }
}
