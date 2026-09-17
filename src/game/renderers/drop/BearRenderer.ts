/* renderers/drop/BearRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BearRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -3, -3 + bob, 6, 5, 0x6a5238);
    px(r, g, -3, -5 + bob, 6, 3, 0x7a6248);
    px(r, g, -4, -6 + bob, 2, 2, 0x6a5238);
    px(r, g, 2, -6 + bob, 2, 2, 0x6a5238);
    px(r, g, -1, -4 + bob, 1, 1, 0x0d1218);
    px(r, g, 1, -4 + bob, 1, 1, 0x0d1218);
  }
}
