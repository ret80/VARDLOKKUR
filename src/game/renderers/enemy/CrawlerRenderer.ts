/* renderers/enemy/CrawlerRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class CrawlerRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const fx = e.facing.x >= 0 ? 1 : -1;

    if (e.hidden) {
      b.primitive.pushEllipse(0, 1, 5, 2.4, 0x3a3226, 0.6);
      px(b, -3, -1, 6, 2, 0x4a4234, 0.7);
      return;
    }
    b.primitive.pushEllipse(0, 3, 6, 2.4, 0x05080d, 0.5 * a);
    const wig = Math.sin(e.t * 12) * 1.5;
    px(b, -5, -2 + bob, 10, 5, (tint as any)(0x4a5238), a);
    px(b, -5, -2 + bob, 10, 2, (tint as any)(0x5a6244), a);
    px(b, -6 + wig, 0 + bob, 2, 3, 0x3a4228, a);
    px(b, 4 - wig, 0 + bob, 2, 3, 0x3a4228, a);
    px(b, fx * 3, -1 + bob, 2, 1, 0xe0a030, a);
  }
}
