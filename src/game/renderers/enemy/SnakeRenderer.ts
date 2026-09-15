/* renderers/enemy/SnakeRenderer.ts — snake не имеет hp-бара (обрабатывается в базе) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class SnakeRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const open = e.state === "open";
    const sway = Math.sin(time * 1.6) * 4;

    const r = getRenderer();
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
      r.drawEllipse(g, sway, -8, 5, 5, { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: eyePulse * a });
      r.drawEllipse(g, sway, -8, 2, 2, { r: 0xff / 255, g: 0xf3 / 255, b: 0xd6 / 255, a: eyePulse * a });
      r.drawEllipse(g, sway, -8, 8 + Math.sin(time * 6) * 2, 8 + Math.sin(time * 6) * 2, { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: eyePulse * 0.7 });
    } else {
      px(g, -10 + sway, -10, 6, 3, 0x05080d, a);
      px(g, 4 + sway, -10, 6, 3, 0x05080d, a);
      px(g, -8 + sway, -9, 2, 1, 0xe05050, a);
      px(g, 6 + sway, -9, 2, 1, 0xe05050, a);
      px(g, -6 + sway, -1, 12, 2, (tint as any)(0x16211b), a);
    }
  }
}
