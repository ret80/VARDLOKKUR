/* renderers/enemy/SnakeRenderer.ts — snake не имеет hp-бара (обрабатывается в базе) */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SnakeRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const open = e.state === "open";
    const sway = Math.sin(time * 1.6) * 4;

    px(g, -10 + sway * 0.4, 6, 20, 14, (tint as any)(0x1c2a24), a);
    px(g, -8 + sway * 0.4, 6, 4, 14, (tint as any)(0x2a3d33), a);
    px(g, -16 + sway, -18, 32, 24, (tint as any)(0x24352c), a);
    px(g, -16 + sway, -18, 32, 4, (tint as any)(0x31463a), a);
    px(g, -13 + sway, -14, 26, 16, (tint as any)(0x1c2a24), a);
    px(g, -15 + sway, -22, 4, 5, (tint as any)(0x3d5245), a);
    px(g, 11 + sway, -22, 4, 5, (tint as any)(0x3d5245), a);
    if (open) {
      px(g, -10 + sway, -4, 20, 8, 0x0a0f0c, a);
      px(g, -8 + sway, -2, 3, 4, 0xd8e8d0, a);
      px(g, 5 + sway, -2, 3, 4, 0xd8e8d0, a);
      const eyePulse = 0.6 + Math.sin(time * 7) * 0.4;
      g.circle(sway, -8, 5).fill({ color: 0xe8c979, alpha: eyePulse * a });
      g.circle(sway, -8, 2).fill({ color: 0xfff3d6, alpha: eyePulse * a });
      g.circle(sway, -8, 8 + Math.sin(time * 6) * 2).stroke({ color: 0xe8c979, width: 1, alpha: eyePulse * 0.7 });
    } else {
      px(g, -10 + sway, -10, 6, 3, 0x05080d, a);
      px(g, 4 + sway, -10, 6, 3, 0x05080d, a);
      px(g, -8 + sway, -9, 2, 1, 0xe05050, a);
      px(g, 6 + sway, -9, 2, 1, 0xe05050, a);
      px(g, -6 + sway, -1, 12, 2, (tint as any)(0x16211b), a);
    }
  }
}
