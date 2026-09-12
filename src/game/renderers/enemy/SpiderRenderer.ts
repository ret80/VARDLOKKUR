/* renderers/enemy/SpiderRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SpiderRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;

    b.primitive.pushEllipse(0, 8, 12, 3, 0x05080d, 0.5 * a);
    const legA = Math.sin(time * 5) * 2;
    for (let i = 0; i < 4; i++) {
      const lx = -9 + i * 6;
      b.primitive.pushLine(lx, 0, lx - 4, 8 + (i % 2 ? legA : -legA), (tint as any)(0x3d2f3a), a, 2);
      b.primitive.pushLine(lx, 0, lx + 4, 8 - (i % 2 ? legA : -legA), (tint as any)(0x3d2f3a), a, 2);
    }
    b.primitive.pushEllipse(0, -2 + bob, 11, 8, (tint as any)(0x4a3a4e), a);
    b.primitive.pushEllipse(0, -6 + bob, 8, 5, (tint as any)(0x5a4a5e), a);
    const eyePulse = 0.6 + Math.sin(time * 4) * 0.4;
    for (const ex of [-4, -1.5, 1.5, 4]) px(b, ex, -7 + bob, 1.5, 1.5, 0xe8c979, eyePulse * a);
    px(b, -2, -2 + bob, 1, 3, 0xd8e8d0, a);
    px(b, 1, -2 + bob, 1, 3, 0xd8e8d0, a);
    if (e.state === "ring") b.primitive.pushCircleStroke(0, -4, 14 + Math.sin(time * 10) * 2, 0x6a8a3a, 1, 0.5);
  }
}
