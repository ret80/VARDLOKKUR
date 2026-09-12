/* renderers/enemy/FrostRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class FrostRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 6) * 1.5;

    b.primitive.pushEllipse(0, 6, 8, 2.6, 0x05080d, 0.5 * a);
    px(b, -5, 1 + step * 0.3, 4, 5, 0x3a4a5c, a);
    px(b, 1, 1 - step * 0.3, 4, 5, 0x3a4a5c, a);
    px(b, -6, -9 + bob, 12, 11, (tint as any)(0x4a6a84), a);
    px(b, -6, -9 + bob, 12, 3, (tint as any)(0x6a8aa4), a);
    px(b, -4, -15 + bob, 9, 7, (tint as any)(0x8fb0c8), a);
    px(b, -4, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(b, 0, -18 + bob, 2, 4, 0xbdeef8, a);
    px(b, 3, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(b, -1, -13 + bob, 1, 1, 0x0d2030, a);
    px(b, 2, -13 + bob, 1, 1, 0x0d2030, a);
  }
}
