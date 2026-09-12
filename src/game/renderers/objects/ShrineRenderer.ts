/* renderers/objects/ShrineRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IShrineData } from "../../models";
import { px } from "../core/primitives";

export class ShrineRenderer implements Renderer<IShrineData> {
  render(b: Batchers, data: IShrineData, ctx: RenderContext): void {
    const time = ctx.time;
    b.primitive.pushEllipse(0, 4, 6, 1.5, 0x05080d, 0.5);
    px(b, -2, -11, 4, 1, 0xc8d3dc);
    px(b, -3, -10, 6, 1, 0x39424e);
    px(b, -4, -9, 8, 11, 0x232c38);
    px(b, -4, -9, 2, 11, 0x2c3642);
    px(b, 3, -9, 1, 11, 0x141a22);
    px(b, -5, 2, 10, 2, 0x1a222c);
    px(b, -1, -8, 2, 1, 0x0a0e14);
    px(b, -2, -7, 4, 4, 0x0a0e14);
    if (data.lit) {
      const fl = Math.round(Math.sin(time * 8) * 0.7);
      b.primitive.pushCircle(0, -5, 4, 0x8fd8e8, 0.18);
      px(b, -1, -6 + fl, 2, 3, 0x8fd8e8, 0.9);
      px(b, 0, -7 + fl, 1, 2, 0xbdeef8);
    }
  }
}
