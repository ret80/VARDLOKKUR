/* renderers/enemy/ReaperRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ReaperRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const float = Math.sin(time * 2) * 2;

    const r = getRenderer();
    r.drawEllipse(g, 0, 8, 9, 2.6, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.4 * a });
    
    // Тело — полигон
    r.drawPoly(g, [-8, 8 + float, -6, -10 + float, 0, -16 + float, 6, -10 + float, 8, 8 + float], (tint as any)(0x0d0f14, a));
    r.drawPoly(g, [-6, -10 + float, 0, -16 + float, 6, -10 + float], (tint as any)(0x161a22, a));
    
    px(g, -3, -12 + float, 7, 5, 0xc8d3dc, a);
    px(g, -2, -11 + float, 2, 2, 0x8fd0e0, a);
    px(g, 1, -11 + float, 2, 2, 0x8fd0e0, a);
    
    let blade = 0;
    if (e.state === "wind") blade = -0.8;
    else if (e.state === "swing") blade = 0.9;
    else if (e.state === "stuck") blade = 1.3;
    const bx = Math.cos(blade) * 12, by = Math.sin(blade) * 12;
    
    // Серп — полигон
    r.drawPoly(g, [8, -4 + float, 8 + bx, -4 + float + by, 8 + bx + 6 * Math.cos(blade + 3.4), -4 + float + by + 6 * Math.sin(blade + 3.4)], (tint as any)(0xb9c2c9, a));
    
    if (e.state === "wind") {
      r.drawEllipse(g, 0, -2 + float, 12 + Math.sin(time * 20) * 2, 12 + Math.sin(time * 20) * 2, { r: 0xe0 / 255, g: 0x50 / 255, b: 0x50 / 255, a: 0.4 });
    }
  }
}
