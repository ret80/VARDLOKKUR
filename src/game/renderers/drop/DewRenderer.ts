/* renderers/drop/DewRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class DewRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4 + data.t) * 0.3;
    r.drawEllipse(g, 0, -2 + bob, 5, 5, { r: 0x8f / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: pulse * 0.4 });
    px(r, g, -1, -4 + bob, 2, 3, 0x8fd8e8, pulse);
    px(r, g, -1, -1 + bob, 2, 1, 0xbdeef8, pulse);
    px(r, g, 0, -5 + bob, 1, 1, 0xbdeef8, pulse);
  }
}
