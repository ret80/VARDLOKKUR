/* renderers/drop/FlowerRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class FlowerRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -1, -1 + bob, 1, 4, 0x5a7a4a);
    px(r, g, -3, -5 + bob, 2, 2, 0xc8d8e8);
    px(r, g, 1, -5 + bob, 2, 2, 0xc8d8e8);
    px(r, g, -1, -7 + bob, 2, 2, 0xc8d8e8);
    px(r, g, -1, -5 + bob, 2, 2, 0xe8c979);
  }
}
