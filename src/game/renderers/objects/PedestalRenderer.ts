/* renderers/objects/PedestalRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IPedestalData } from "../../models";
import { px } from "../core/primitives";

export class PedestalRenderer implements Renderer<IPedestalData> {
  render(b: Batchers, data: IPedestalData, ctx: RenderContext): void {
    const time = ctx.time;
    b.primitive.pushEllipse(0, 7, 8, 2.6, 0x05080d, 0.5);
    px(b, -6, 2, 12, 4, 0x4e5a68);
    px(b, -6, 2, 12, 1, 0x5c6875);
    px(b, -4, -6, 8, 8, 0x39424e);
    px(b, -4, -6, 8, 1, 0x4e5a68);
    px(b, -2, -12, 4, 6, 0x4e5a68);
    if (!data.taken) {
      const sealed = data.guardsLeft > 0;
      const col = sealed ? 0xe05050 : 0x63d8c8;
      const core = sealed ? 0xf8a0a0 : 0xbdeef8;
      const pulse = 0.6 + Math.sin(time * (sealed ? 5 : 3)) * 0.4;
      px(b, -1, -11, 2, 4, col, pulse);
      px(b, -1, -10, 1, 2, core, pulse);
      b.primitive.pushCircleStroke(0, -9, 6, 1, col, pulse * 0.6);
    } else {
      px(b, -1, -11, 2, 4, 0x232c38);
    }
  }
}
