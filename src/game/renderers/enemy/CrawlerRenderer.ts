/* renderers/enemy/CrawlerRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class CrawlerRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const fx = e.facing.x >= 0 ? 1 : -1;

    if (e.hidden) {
      px(g, -3, -1, 6, 2, 0x3a3226, 0.7);
      return;
    }
    const r = ctx.tint as (c: number) => number;
    const alpha = ctx.a as number;
    const wig = Math.sin(e.t * 12) * 1.5;
    px(g, -5, -2 + bob, 10, 5, r(0x4a5238), alpha);
    px(g, -5, -2 + bob, 10, 2, r(0x5a6244), alpha);
    px(g, -6 + wig, 0 + bob, 2, 3, 0x3a4228, alpha);
    px(g, 4 - wig, 0 + bob, 2, 3, 0x3a4228, alpha);
    px(g, fx * 3, -1 + bob, 2, 1, 0xe0a030, alpha);
  }
}
