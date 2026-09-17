/* renderers/enemy/DraugrRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class DraugrRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 8) * 2;
    const fx = e.facing.x >= 0 ? 1 : -1;

    px(r, g, -4, 1 + step * 0.3, 3, 4, 0x2c3038, a);
    px(r, g, 1, 1 - step * 0.3, 3, 4, 0x2c3038, a);
    px(r, g, -4, -8 + bob, 8, 9, (tint as any)(0x55606c), a);
    px(r, g, -3, -13 + bob, 7, 6, (tint as any)(0x8f9aa8), a);
    px(r, g, -1 * fx + 0, -11 + bob, 1, 1, 0xe05050, a);
    px(r, g, 2 * fx, -11 + bob, 1, 1, 0xe05050, a);
    if (fx >= 0) {
      px(r, g, 5, -8 + bob, 3, 8, (tint as any)(0x4a3e2e), a);
      px(r, g, 6, -6 + bob, 1, 3, 0x8a744a, a);
    } else {
      px(r, g, -8, -8 + bob, 3, 8, (tint as any)(0x4a3e2e), a);
      px(r, g, -7, -6 + bob, 1, 3, 0x8a744a, a);
    }
  }
}
