/* renderers/enemy/GiantRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class GiantRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 4) * 1.5;

    const r = getRenderer();
    r.drawEllipse(g, 0, 10, 13, 3, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 * a });
    px(g, -7, 2 + step * 0.3, 6, 8, 0x4e5a68, a);
    px(g, 1, 2 - step * 0.3, 6, 8, 0x4e5a68, a);
    px(g, -9, -12 + bob, 18, 15, (tint as any)(0x5a6570), a);
    px(g, -9, -12 + bob, 18, 4, (tint as any)(0x6a7580), a);
    px(g, -6, -19 + bob, 12, 8, (tint as any)(0x6a7580), a);
    px(g, -4, -17 + bob, 3, 2, 0xe08a3c, a);
    px(g, 1, -17 + bob, 3, 2, 0xe08a3c, a);
    if (e.hp <= e.maxHp / 2) {
      // Шрамы — рисуем полигонами
      r.drawPoly(g, [-8, -8 + bob, -2, -2 + bob, -6, 2 + bob], { r: 0x39 / 255, g: 0x42 / 255, b: 0x4e / 255, a: 1.5 * a });
      r.drawPoly(g, [6, -9 + bob, 2, -3 + bob, 7, 1 + bob], { r: 0x39 / 255, g: 0x42 / 255, b: 0x4e / 255, a: 1.5 * a });
    }
    if (e.state === "wind") {
      // Ветровая аура — эллипс
      const windR = 16 + Math.sin(time * 18) * 2;
      r.drawEllipse(g, 0, 0, windR, windR, { r: 0xe0 / 255, g: 0x8a / 255, b: 0x3c / 255, a: 0.5 });
    }
  }
}
