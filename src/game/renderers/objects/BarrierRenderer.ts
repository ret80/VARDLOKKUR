/* renderers/objects/BarrierRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IBarrierData } from "../../models";
import { px } from "../core/primitives";

export class BarrierRenderer implements Renderer<IBarrierData> {
  render(b: Batchers, data: IBarrierData, ctx: RenderContext): void {
    if (!data.active) return;
    const time = ctx.time;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      px(b, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
    }
    b.primitive.pushLine(-20, -20, 20, -20, 0x63d8c8, pulse * 0.4, 1);
    b.primitive.pushLine(20, -20, 20, 4, 0x63d8c8, pulse * 0.4, 1);
    b.primitive.pushLine(20, 4, -20, 4, 0x63d8c8, pulse * 0.4, 1);
    b.primitive.pushLine(-20, 4, -20, -20, 0x63d8c8, pulse * 0.4, 1);
  }
}
