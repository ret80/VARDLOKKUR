/* renderers/enemy/RavenRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class RavenRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const flap = Math.sin(e.t * 16) * 4;
    const fx = e.facing.x >= 0 ? 1 : -1;

    px(b, -3, -3 + bob, 6, 5, (tint as any)(0x1d232c), a);
    px(b, -2, -6 + bob, 5, 4, (tint as any)(0x242c38), a);
    px(b, fx * 3, -5 + bob, 3 * fx, 2, 0xe8c979, a);
    px(b, fx * 2, -6 + bob, 1, 1, 0xe05050, a);
    // Left wing: 4-point polygon -> 2 triangles
    b.primitive.pushTriangle(-3, -2 + bob, -9, -4 + bob - flap, -4, 1 + bob, (tint as any)(0x161c24), a);
    b.primitive.pushTriangle(-9, -4 + bob - flap, -4, 1 + bob, -4, 1 + bob, (tint as any)(0x161c24), a);
    // Right wing: 4-point polygon -> 2 triangles
    b.primitive.pushTriangle(3, -2 + bob, 9, -4 + bob - flap, 4, 1 + bob, (tint as any)(0x161c24), a);
    b.primitive.pushTriangle(9, -4 + bob - flap, 4, 1 + bob, 4, 1 + bob, (tint as any)(0x161c24), a);
  }
}
