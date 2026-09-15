/* renderers/drop/RuneRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class RuneRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    px(g, -3, -5 + bob, 6, 8, 0x4e5a68);
    px(g, -2, -4 + bob, 4, 6, 0x63d8c8, pulse);
    px(g, -1, -3 + bob, 1, 4, 0x0d2a26);
    px(g, 0, -2 + bob, 2, 1, 0x0d2a26);
    const r = getRenderer();
    r.drawEllipse(g, 0, -1 + bob, 7, 7, { r: 0x63 / 255, g: 0xd8 / 255, b: 0xc8 / 255, a: pulse * 0.5 });
  }
}
