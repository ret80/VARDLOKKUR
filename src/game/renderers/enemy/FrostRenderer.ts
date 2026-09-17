/* renderers/enemy/FrostRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { drawEllipse, px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class FrostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 6) * 1.5;

    drawEllipse(r, g, 0, 6, 8, 2.6, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 * a });
    px(r, g, -5, 1 + step * 0.3, 4, 5, 0x3a4a5c, a);
    px(r, g, 1, 1 - step * 0.3, 4, 5, 0x3a4a5c, a);
    px(r, g, -6, -9 + bob, 12, 11, (tint as any)(0x4a6a84), a);
    px(r, g, -6, -9 + bob, 12, 3, (tint as any)(0x6a8aa4), a);
    px(r, g, -4, -15 + bob, 9, 7, (tint as any)(0x8fb0c8), a);
    px(r, g, -4, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(r, g, 0, -18 + bob, 2, 4, 0xbdeef8, a);
    px(r, g, 3, -17 + bob, 2, 3, 0x9fe0ee, a);
    px(r, g, -1, -13 + bob, 1, 1, 0x0d2030, a);
    px(r, g, 2, -13 + bob, 1, 1, 0x0d2030, a);
  }
}
