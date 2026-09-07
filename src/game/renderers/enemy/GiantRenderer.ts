/* renderers/enemy/GiantRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class GiantRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 4) * 1.5;

    g.ellipse(0, 10, 13, 3).fill({ color: 0x05080d, alpha: 0.5 * a });
    px(g, -7, 2 + step * 0.3, 6, 8, 0x4e5a68, a);
    px(g, 1, 2 - step * 0.3, 6, 8, 0x4e5a68, a);
    px(g, -9, -12 + bob, 18, 15, (tint as any)(0x5a6570), a);
    px(g, -9, -12 + bob, 18, 4, (tint as any)(0x6a7580), a);
    px(g, -6, -19 + bob, 12, 8, (tint as any)(0x6a7580), a);
    px(g, -4, -17 + bob, 3, 2, 0xe08a3c, a);
    px(g, 1, -17 + bob, 3, 2, 0xe08a3c, a);
    if (e.hp <= e.maxHp / 2) {
      g.moveTo(-8, -8 + bob).lineTo(-2, -2 + bob).lineTo(-6, 2 + bob).stroke({ color: 0x39424e, width: 1.5, alpha: a });
      g.moveTo(6, -9 + bob).lineTo(2, -3 + bob).lineTo(7, 1 + bob).stroke({ color: 0x39424e, width: 1.5, alpha: a });
    }
    if (e.state === "wind") g.circle(0, 0, 16 + Math.sin(time * 18) * 2).stroke({ color: 0xe08a3c, width: 1.5, alpha: 0.5 });
  }
}
