/* renderers/objects/ChestRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IChestData } from "../../models";
import { px } from "../core/primitives";

export class ChestRenderer implements Renderer<IChestData> {
  render(b: Batchers, data: IChestData, _ctx: RenderContext): void {
    b.primitive.pushEllipse(0, 5, 7, 2.4, 0x05080d, 0.5);
    px(b, -6, -2, 12, 7, 0x5a4632);
    px(b, -6, -2, 12, 2, 0x6e5840);
    px(b, -6, 3, 12, 2, 0x463626);
    if (data.opened) {
      px(b, -6, -6, 12, 4, 0x463626);
      px(b, -5, -5, 10, 2, 0x1d1610);
    } else {
      px(b, -6, -6, 12, 4, 0x6e5840);
      px(b, -1, -3, 2, 4, 0xc9a24b);
    }
  }
}
