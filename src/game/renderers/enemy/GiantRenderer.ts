/* renderers/enemy/GiantRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class GiantRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 4) * 1.5;

    b.primitive.pushEllipse(0, 10, 13, 3, 0x05080d, 0.5 * a);
    px(b, -7, 2 + step * 0.3, 6, 8, 0x4e5a68, a);
    px(b, 1, 2 - step * 0.3, 6, 8, 0x4e5a68, a);
    px(b, -9, -12 + bob, 18, 15, (tint as any)(0x5a6570), a);
    px(b, -9, -12 + bob, 18, 4, (tint as any)(0x6a7580), a);
    px(b, -6, -19 + bob, 12, 8, (tint as any)(0x6a7580), a);
    px(b, -4, -17 + bob, 3, 2, 0xe08a3c, a);
    px(b, 1, -17 + bob, 3, 2, 0xe08a3c, a);
    if (e.hp <= e.maxHp / 2) {
      b.primitive.pushLine(-8, -8 + bob, -2, -2 + bob, 0x39424e, a, 1.5);
      b.primitive.pushLine(-2, -2 + bob, -6, 2 + bob, 0x39424e, a, 1.5);
      b.primitive.pushLine(-6, 2 + bob, -8, -8 + bob, 0x39424e, a, 1.5);
      b.primitive.pushLine(6, -9 + bob, 2, -3 + bob, 0x39424e, a, 1.5);
      b.primitive.pushLine(2, -3 + bob, 7, 1 + bob, 0x39424e, a, 1.5);
      b.primitive.pushLine(7, 1 + bob, 6, -9 + bob, 0x39424e, a, 1.5);
    }
    if (e.state === "wind") b.primitive.pushCircleStroke(0, 0, 16 + Math.sin(time * 18) * 2, 0xe08a3c, 1.5, 0.5);
  }
}
