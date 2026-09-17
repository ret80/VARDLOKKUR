/* renderers/drop/RelicRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class RelicRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    px(r, g, -2, -6 + bob, 4, 7, 0x8f9aa8);
    px(r, g, -2, -6 + bob, 4, 1, 0xc8d3dc);
    px(r, g, -1, -4 + bob, 2, 3, 0x63d8c8, pulse);
    r.drawEllipse(g, 0, -2 + bob, 7, 7, { r: 0x63 / 255, g: 0xd8 / 255, b: 0xc8 / 255, a: pulse * 0.5 });
  }
}
