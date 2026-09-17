/* renderers/drop/SwordDropRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class SwordDropRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -1, -6 + bob, 2, 8, 0xb9c2c9);
    px(r, g, -1, -6 + bob, 1, 8, 0xd8e2ea);
    px(r, g, -3, 1 + bob, 6, 1, 0x5a4632);
    px(r, g, -1, 2 + bob, 2, 2, 0x3a3226);
  }
}
