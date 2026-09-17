/* renderers/objects/BarrierRenderer.ts */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IBarrierData } from "../../models";
import { px, clearGraphics, drawRect } from "../core/primitives";

export class BarrierRenderer implements Renderer<IBarrierData> {
  render(g: GraphicsHandle, data: IBarrierData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    clearGraphics(r, g);
    if (!data.active) return;
    const time = ctx.time;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      px(r, g, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
    }
    // Рисуем прямоугольник через primitives
    drawRect(r, g, -20, -20, 40, 24, { r: ((0x63 >> 16) & 0xff) / 255, g: ((0x63 >> 8) & 0xff) / 255, b: (0x63 & 0xff) / 255, a: pulse * 0.4 });
  }
}
