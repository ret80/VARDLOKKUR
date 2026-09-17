/* renderers/drop/ArrowsDropRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class ArrowsDropRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -2, -4 + bob, 1, 7, 0x8a744a);
    px(r, g, -2, -5 + bob, 1, 2, 0xb9c2c9);
    px(r, g, 1, -2 + bob, 1, 6, 0x8a744a);
    px(r, g, 1, -3 + bob, 1, 2, 0xb9c2c9);
  }
}
