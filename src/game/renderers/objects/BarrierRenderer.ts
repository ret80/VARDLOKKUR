/* renderers/objects/BarrierRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Renderer, RenderContext } from "../core/types";
import type { IBarrierData } from "../../models";
import { px } from "../core/primitives";

export class BarrierRenderer implements Renderer<IBarrierData> {
  render(g: GraphicsHandle, data: IBarrierData, ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    if (!data.active) return;
    const time = ctx.time;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      px(g, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
    }
    r.drawRect(g, { x: -20, y: -20, width: 40, height: 24 }, { r: 0x63 / 255, g: 0xd8 / 255, b: 0xc8 / 255, a: pulse * 0.4 });
  }
}
