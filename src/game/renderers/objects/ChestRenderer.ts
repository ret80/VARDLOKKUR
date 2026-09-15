/* renderers/objects/ChestRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Renderer, RenderContext } from "../core/types";
import type { IChestData } from "../../models";
import { px } from "../core/primitives";

export class ChestRenderer implements Renderer<IChestData> {
  render(g: GraphicsHandle, data: IChestData, _ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    r.drawEllipse(g, 0, 5, 7, 2.4, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 });
    px(g, -6, -2, 12, 7, 0x5a4632);
    px(g, -6, -2, 12, 2, 0x6e5840);
    px(g, -6, 3, 12, 2, 0x463626);
    if (data.opened) {
      px(g, -6, -6, 12, 4, 0x463626);
      px(g, -5, -5, 10, 2, 0x1d1610);
    } else {
      px(g, -6, -6, 12, 4, 0x6e5840);
      px(g, -1, -3, 2, 4, 0xc9a24b);
    }
  }
}
