/* renderers/drop/AmberRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class AmberRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -2, -4 + bob, 4, 6, 0xc8822a);
    px(r, g, -1, -2 + bob, 2, 2, 0xf8d878);
    r.drawEllipse(g, 0, -1 + bob, 6, 6, { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: 0.5 });
  }
}
