/* renderers/enemy/ReaperRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ReaperRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const float = Math.sin(time * 2) * 2;

    g.ellipse(0, 8, 9, 2.6).fill({ color: 0x05080d, alpha: 0.4 * a });
    g.moveTo(-8, 8 + float).lineTo(-6, -10 + float).lineTo(0, -16 + float).lineTo(6, -10 + float).lineTo(8, 8 + float).closePath()
      .fill({ color: (tint as any)(0x0d0f14), alpha: a });
    g.moveTo(-6, -10 + float).lineTo(0, -16 + float).lineTo(6, -10 + float).closePath()
      .fill({ color: (tint as any)(0x161a22), alpha: a });
    px(g, -3, -12 + float, 7, 5, 0xc8d3dc, a);
    px(g, -2, -11 + float, 2, 2, 0x8fd0e0, a);
    px(g, 1, -11 + float, 2, 2, 0x8fd0e0, a);
    let blade = 0;
    if (e.state === "wind") blade = -0.8;
    else if (e.state === "swing") blade = 0.9;
    else if (e.state === "stuck") blade = 1.3;
    const bx = Math.cos(blade) * 12, by = Math.sin(blade) * 12;
    g.moveTo(8, -4 + float).lineTo(8 + bx, -4 + float + by)
      .stroke({ color: 0x3a3226, width: 2, alpha: a });
    g.arc(8 + bx, -4 + float + by, 6, blade + 1.6, blade + 3.4)
      .stroke({ color: (tint as any)(0xb9c2c9), width: 2, alpha: a });
    if (e.state === "wind") {
      g.circle(0, -2 + float, 12 + Math.sin(time * 20) * 2).stroke({ color: 0xe05050, width: 1, alpha: 0.4 });
    }
  }
}
