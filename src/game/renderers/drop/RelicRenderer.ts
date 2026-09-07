/* renderers/drop/RelicRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class RelicRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    px(g, -2, -6 + bob, 4, 7, 0x8f9aa8);
    px(g, -2, -6 + bob, 4, 1, 0xc8d3dc);
    px(g, -1, -4 + bob, 2, 3, 0x63d8c8, pulse);
    g.circle(0, -2 + bob, 7).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.5 });
  }
}
