/* renderers/enemy/SpiderRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SpiderRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;

    const r = getRenderer();
    r.drawEllipse(g, 0, 8, 12, 3, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 * a });
    const legA = Math.sin(time * 5) * 2;
    for (let i = 0; i < 4; i++) {
      const lx = -9 + i * 6;
      const lc = (tint as any)(0x3d2f3a);
      const lColor = typeof lc === 'number' ? { r: (lc >> 16 & 0xff) / 255, g: (lc >> 8 & 0xff) / 255, b: (lc & 0xff) / 255, a } : lc;
      // Левая нога — полигон (approximation line)
      r.drawPoly(g, [lx, 0, lx - 4, 8 + (i % 2 ? legA : -legA)], lColor);
      // Правая нога
      r.drawPoly(g, [lx, 0, lx + 4, 8 - (i % 2 ? legA : -legA)], lColor);
    }
    const bodyColor1 = (tint as any)(0x4a3a4e);
    const bc1 = typeof bodyColor1 === 'number' ? { r: (bodyColor1 >> 16 & 0xff) / 255, g: (bodyColor1 >> 8 & 0xff) / 255, b: (bodyColor1 & 0xff) / 255, a } : bodyColor1;
    r.drawEllipse(g, 0, -2 + bob, 11, 8, bc1);
    const bodyColor2 = (tint as any)(0x5a4a5e);
    const bc2 = typeof bodyColor2 === 'number' ? { r: (bodyColor2 >> 16 & 0xff) / 255, g: (bodyColor2 >> 8 & 0xff) / 255, b: (bodyColor2 & 0xff) / 255, a } : bodyColor2;
    r.drawEllipse(g, 0, -6 + bob, 8, 5, bc2);
    const eyePulse = 0.6 + Math.sin(time * 4) * 0.4;
    for (const ex of [-4, -1.5, 1.5, 4]) px(g, ex, -7 + bob, 1.5, 1.5, 0xe8c979, eyePulse * a);
    px(g, -2, -2 + bob, 1, 3, 0xd8e8d0, a);
    px(g, 1, -2 + bob, 1, 3, 0xd8e8d0, a);
    if (e.state === "ring") {
      r.drawEllipse(g, 0, -4, 14 + Math.sin(time * 10) * 2, 14 + Math.sin(time * 10) * 2, { r: 0x6a / 255, g: 0x8a / 255, b: 0x3a / 255, a: 0.5 });
    }
  }
}
