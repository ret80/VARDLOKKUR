/* renderers/drop/HornRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HornRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const r = getRenderer();
    // Рог — полигон
    r.drawPoly(g, [-3, -4 + bob, 3, -1 + bob, 2, 2 + bob, -3, 0 + bob], { r: 0xc9 / 255, g: 0xa2 / 255, b: 0x4b / 255, a: 1 });
    px(g, -3, -4 + bob, 2, 4, 0xe8c979);
  }
}
