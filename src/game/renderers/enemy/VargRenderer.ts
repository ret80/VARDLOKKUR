/* renderers/enemy/VargRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class VargRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const run = Math.sin(e.t * 14) * 2.5;
    const fx = e.facing.x >= 0 ? 1 : -1;
    const M = (x: number, w: number) => (fx >= 0 ? x : -x - w);

    px(g, M(-6, 3), 0 + run * 0.3, 3, 4, (tint as any)(0x9fb0c0), a);
    px(g, M(-1, 3), 0 - run * 0.3, 3, 4, (tint as any)(0x9fb0c0), a);
    px(g, M(-7, 9), -5 + bob, 9, 5, (tint as any)(0xd8e2ea), a);
    px(g, M(-7, 9), -5 + bob, 9, 1, (tint as any)(0xe8f0f6), a);
    px(g, M(-7, 9), -1 + bob, 9, 1, (tint as any)(0xb9c8d6), a);
    px(g, M(1, 6), -7 + bob, 6, 5, (tint as any)(0xd8e2ea), a);
    px(g, M(2, 2), -9 + bob, 2, 2, (tint as any)(0xd8e2ea), a);
    px(g, M(5, 2), -9 + bob, 2, 2, (tint as any)(0xd8e2ea), a);
    px(g, M(2, 1), -8 + bob, 1, 1, (tint as any)(0x9fb0c0), a);
    px(g, M(5, 1), -8 + bob, 1, 1, (tint as any)(0x9fb0c0), a);
    px(g, M(6, 3), -5 + bob, 3, 2, (tint as any)(0xf2f8fc), a);
    px(g, M(8, 1), -5 + bob, 1, 1, 0x0d1218, a);
    px(g, M(6, 2), -3 + bob, 2, 1, (tint as any)(0x9fb0c0), a);
    px(g, M(4, 1), -6 + bob, 1, 1, 0xe05050, a);
    if (e.lungeT > 0) {
      px(g, M(6, 2), -3 + bob, 2, 1, 0xffffff, a);
      px(g, M(7, 1), -2 + bob, 1, 1, 0xffffff, a);
    }
    px(g, M(-8, 2), -5 + bob, 2, 3, (tint as any)(0xd8e2ea), a);
    px(g, M(-9, 2), -7 + bob, 2, 2, (tint as any)(0xf2f8fc), a);
  }
}
