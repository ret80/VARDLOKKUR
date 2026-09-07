/* renderers/enemy/SpiderRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SpiderRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;

    g.ellipse(0, 8, 12, 3).fill({ color: 0x05080d, alpha: 0.5 * a });
    const legA = Math.sin(time * 5) * 2;
    for (let i = 0; i < 4; i++) {
      const lx = -9 + i * 6;
      g.moveTo(lx, 0).lineTo(lx - 4, 8 + (i % 2 ? legA : -legA)).stroke({ color: (tint as any)(0x3d2f3a), width: 2, alpha: a });
      g.moveTo(lx, 0).lineTo(lx + 4, 8 - (i % 2 ? legA : -legA)).stroke({ color: (tint as any)(0x3d2f3a), width: 2, alpha: a });
    }
    g.ellipse(0, -2 + bob, 11, 8).fill({ color: (tint as any)(0x4a3a4e), alpha: a });
    g.ellipse(0, -6 + bob, 8, 5).fill({ color: (tint as any)(0x5a4a5e), alpha: a });
    const eyePulse = 0.6 + Math.sin(time * 4) * 0.4;
    for (const ex of [-4, -1.5, 1.5, 4]) px(g, ex, -7 + bob, 1.5, 1.5, 0xe8c979, eyePulse * a);
    px(g, -2, -2 + bob, 1, 3, 0xd8e8d0, a);
    px(g, 1, -2 + bob, 1, 3, 0xd8e8d0, a);
    if (e.state === "ring") g.circle(0, -4, 14 + Math.sin(time * 10) * 2).stroke({ color: 0x6a8a3a, width: 1, alpha: 0.5 });
  }
}
