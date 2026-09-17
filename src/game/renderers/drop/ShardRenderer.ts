/* renderers/drop/ShardRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class ShardRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const gl = 0.7 + Math.sin(time * 3 + data.t) * 0.3;
    // Осколок — полигон
    r.drawPoly(g, [0, -8 + bob, 3, -2 + bob, 1, 2 + bob, -2, 2 + bob, -3, -3 + bob], { r: 0x9f / 255, g: 0xc8 / 255, b: 0xdc / 255, a: gl });
    px(r, g, -1, -6 + bob, 1, 5, 0xe8f4fc, gl * 0.9);
  }
}
