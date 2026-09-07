/* renderers/enemy/FrostRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class FrostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 6) * 1.5;

    g.ellipse(0, 6, 8, 2.6).fill({ color: 0x05080d, alpha: 0.5 * a });
    px(g, -5, 1 + step * 0.3, 4, 5, 0x3a4a5c, a);
    px(g, 1, 1 - step * 0.3, 4, 5, 0x3a4a5c, a);
    px(g, -6, -9 + bob, 12, 11, (tint as any)(0x4a6a84), a);
    px(g, -6, -9 + bob, 12, 3, (tint as any)(0x6a8aa4), a);
    px(g, -4, -15 + bob, 9, 7, (tint as any)(0x8fb0c8), a);
    px(g, -4, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(g, 0, -18 + bob, 2, 4, 0xbdeef8, a);
    px(g, 3, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(g, -1, -13 + bob, 1, 1, 0x0d2030, a);
    px(g, 2, -13 + bob, 1, 1, 0x0d2030, a);
  }
}
