/* renderers/objects/ChestRenderer.ts */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IChestData } from "../../models";
import { px, ell, clearGraphics } from "../core/primitives";

export class ChestRenderer implements Renderer<IChestData> {
  render(g: GraphicsHandle, data: IChestData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    clearGraphics(r, g);
    ell(r, g, 0, 5, 7, 2.4, 0x05080d, 0.5);
    px(r, g, -6, -2, 12, 7, 0x5a4632);
    px(r, g, -6, -2, 12, 2, 0x6e5840);
    px(r, g, -6, 3, 12, 2, 0x463626);
    if (data.opened) {
      px(r, g, -6, -6, 12, 4, 0x463626);
      px(r, g, -5, -5, 10, 2, 0x1d1610);
    } else {
      px(r, g, -6, -6, 12, 4, 0x6e5840);
      px(r, g, -1, -3, 2, 4, 0xc9a24b);
    }
  }
}
