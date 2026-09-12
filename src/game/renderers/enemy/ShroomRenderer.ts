/* renderers/enemy/ShroomRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ShroomRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;

    b.primitive.pushEllipse(0, 4, 5, 2, 0x05080d, 0.5 * a);
    px(b, -2, -2 + bob, 5, 6, 0xb9b0a0, a);
    const charge = e.state === "charge" ? 1 + Math.sin(e.t * 20) * 0.1 : 1;
    b.primitive.pushEllipse(0, -4 + bob, 7 * charge, 5 * charge, (tint as any)(0x6a4a5c), a);
    b.primitive.pushEllipse(0, -6 + bob, 5 * charge, 2.5 * charge, (tint as any)(0x7d5a6e), a);
    px(b, -3, -5 + bob, 1, 1, 0xe8dcc0, a);
    px(b, 2, -4 + bob, 1, 1, 0xe8dcc0, a);
    px(b, -1, -2 + bob, 1, 1, 0x2a2228, a);
    px(b, 2, -2 + bob, 1, 1, 0x2a2228, a);
  }
}
