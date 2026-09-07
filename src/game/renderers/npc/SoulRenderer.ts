/* renderers/npc/SoulRenderer.ts */

import { Graphics } from "pixi.js";
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class SoulRenderer extends NpcRenderer {
  protected drawBody(g: Graphics, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const time = ctx.time;
    const fl = Math.sin(time * 2.4) * 2.5;
    const a = 0.5 + Math.sin(time * 3.1) * 0.15;
    g.moveTo(-4, 2 + fl).lineTo(0, 8 + fl).lineTo(4, 2 + fl).lineTo(2, 3 + fl).lineTo(0, 6 + fl).lineTo(-2, 3 + fl).closePath()
      .fill({ color: 0x8fd8e8, alpha: a * 0.5 });
    px(g, -4, -8 + fl, 9, 10, 0x8fd8e8, a * 0.75);
    px(g, -3, -11 + fl, 7, 4, 0xbdeef8, a);
    px(g, -2, -9 + fl, 2, 2, 0x0d1a24, a);
    px(g, 1, -9 + fl, 2, 2, 0x0d1a24, a);
    g.circle(0, -4 + fl, 8).stroke({ color: 0x8fd8e8, width: 1, alpha: a * 0.35 });
  }
}
