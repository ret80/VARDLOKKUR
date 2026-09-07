/* renderers/objects/BarrierRenderer.ts */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IBarrierData } from "../../models";
import { px } from "../core/primitives";

export class BarrierRenderer implements Renderer<IBarrierData> {
  render(g: Graphics, data: IBarrierData, ctx: RenderContext): void {
    g.clear();
    if (!data.active) return;
    const time = ctx.time;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      px(g, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
    }
    g.rect(-20, -20, 40, 24).stroke({ color: 0x63d8c8, width: 1, alpha: pulse * 0.4 });
  }
}
