/* renderers/drop/ShardRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class ShardRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const gl = 0.7 + Math.sin(time * 3 + data.t) * 0.3;
    g.moveTo(0, -8 + bob).lineTo(3, -2 + bob).lineTo(1, 2 + bob).lineTo(-2, 2 + bob).lineTo(-3, -3 + bob).closePath()
      .fill({ color: 0x9fc8dc, alpha: gl });
    px(g, -1, -6 + bob, 1, 5, 0xe8f4fc, gl * 0.9);
  }
}
