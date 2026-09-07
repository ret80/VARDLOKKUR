/* renderers/npc/DaughterRenderer.ts */

import { Graphics } from "pixi.js";
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class DaughterRenderer extends NpcRenderer {
  protected drawBody(g: Graphics, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const time = ctx.time;
    const a = 0.6 + Math.sin(time * 2.5) * 0.15;
    g.moveTo(-4, 4 + bob).lineTo(-3, -8 + bob).lineTo(3, -8 + bob).lineTo(4, 4 + bob).closePath()
      .fill({ color: 0x8fb0c8, alpha: a * 0.5 });
    px(g, -3, -13 + bob, 7, 6, 0xc8d8e8, a);
    px(g, -3, -14 + bob, 7, 3, 0x4a3e5c, a);
    px(g, -1, -11 + bob, 1, 1, 0x2a3444, a);
    px(g, 1, -11 + bob, 1, 1, 0x2a3444, a);
  }
}
