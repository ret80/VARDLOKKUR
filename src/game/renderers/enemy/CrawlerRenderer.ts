/* renderers/enemy/CrawlerRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class CrawlerRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const fx = e.facing.x >= 0 ? 1 : -1;

    if (e.hidden) {
      g.ellipse(0, 1, 5, 2.4).fill({ color: 0x3a3226, alpha: 0.6 });
      px(g, -3, -1, 6, 2, 0x4a4234, 0.7);
      return;
    }
    g.ellipse(0, 3, 6, 2.4).fill({ color: 0x05080d, alpha: 0.5 * a });
    const wig = Math.sin(e.t * 12) * 1.5;
    px(g, -5, -2 + bob, 10, 5, (tint as any)(0x4a5238), a);
    px(g, -5, -2 + bob, 10, 2, (tint as any)(0x5a6244), a);
    px(g, -6 + wig, 0 + bob, 2, 3, 0x3a4228, a);
    px(g, 4 - wig, 0 + bob, 2, 3, 0x3a4228, a);
    px(g, fx * 3, -1 + bob, 2, 1, 0xe0a030, a);
  }
}
