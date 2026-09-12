/* renderers/enemy/SnakeRenderer.ts — snake не имеет hp-бара (обрабатывается в базе) */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SnakeRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const open = e.state === "open";
    const sway = Math.sin(time * 1.6) * 4;

    px(b, -10 + sway * 0.4, 6, 20, 14, (tint as any)(0x1c2a24), a);
    px(b, -8 + sway * 0.4, 6, 4, 14, (tint as any)(0x2a3d33), a);
    px(b, -16 + sway, -18, 32, 24, (tint as any)(0x24352c), a);
    px(b, -16 + sway, -18, 32, 4, (tint as any)(0x31463a), a);
    px(b, -13 + sway, -14, 26, 16, (tint as any)(0x1c2a24), a);
    px(b, -15 + sway, -22, 4, 5, (tint as any)(0x3d5245), a);
    px(b, 11 + sway, -22, 4, 5, (tint as any)(0x3d5245), a);
    if (open) {
      px(b, -10 + sway, -4, 20, 8, 0x0a0f0c, a);
      px(b, -8 + sway, -2, 3, 4, 0xd8e8d0, a);
      px(b, 5 + sway, -2, 3, 4, 0xd8e8d0, a);
      const eyePulse = 0.6 + Math.sin(time * 7) * 0.4;
      b.primitive.pushCircle(sway, -8, 5, 0xe8c979, eyePulse * a);
      b.primitive.pushCircle(sway, -8, 2, 0xfff3d6, eyePulse * a);
      b.primitive.pushCircleStroke(sway, -8, 8 + Math.sin(time * 6) * 2, 0xe8c979, 1, eyePulse * 0.7);
    } else {
      px(b, -10 + sway, -10, 6, 3, 0x05080d, a);
      px(b, 4 + sway, -10, 6, 3, 0x05080d, a);
      px(b, -8 + sway, -9, 2, 1, 0xe05050, a);
      px(b, 6 + sway, -9, 2, 1, 0xe05050, a);
      px(b, -6 + sway, -1, 12, 2, (tint as any)(0x16211b), a);
    }
  }
}
