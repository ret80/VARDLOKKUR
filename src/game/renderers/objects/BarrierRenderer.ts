/* renderers/objects/BarrierRenderer.ts */

import type { DrawTarget } from '../../renderers/core/primitives';
import type { Renderer, RenderContext } from "../core/types";
import type { IBarrierData } from "../../models";
import { px, clearGraphics } from "../core/primitives";

export class BarrierRenderer implements Renderer<IBarrierData> {
  render(g: DrawTarget, data: IBarrierData, ctx: RenderContext): void {
    clearGraphics(g);
    if (!data.active) return;
    const time = ctx.time;
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      px(g, x - 1, -20 + Math.sin(time * 2 + i) * 3, 2, 24, 0x63d8c8, pulse * 0.5);
    }
    // Рисуем прямоугольник через primitives
    const r = ((0x63 >> 16) & 0xff) / 255;
    const g2 = ((0x63 >> 8) & 0xff) / 255;
    const b = (0x63 & 0xff) / 255;
    // Для прямоугольника с fill/stroke используем прямой вызов
    const colorHex = ((Math.round(r * 255) << 16) | (Math.round(g2 * 255) << 8) | Math.round(b * 255)) as number;
    (g as any).rect(-20, -20, 40, 24).fill({ color: colorHex, alpha: pulse * 0.4 });
  }
}
