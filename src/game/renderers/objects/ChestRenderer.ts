/* renderers/objects/ChestRenderer.ts */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IChestData } from "../../models";
import { px } from "../core/primitives";

export class ChestRenderer implements Renderer<IChestData> {
  render(g: Graphics, data: IChestData, _ctx: RenderContext): void {
    g.clear();
    g.ellipse(0, 5, 7, 2.4).fill({ color: 0x05080d, alpha: 0.5 });
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
