/* renderers/enemy/ReaperRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ReaperRenderer extends BaseEnemyRenderer {
  protected drawBody(b: Batchers, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const float = Math.sin(time * 2) * 2;

    b.primitive.pushEllipse(0, 8, 9, 2.6, 0x05080d, 0.4 * a);
    // Body: 5-point polygon -> 3 triangles (fan from vertex 0)
    b.primitive.pushTriangle(-8, 8 + float, -6, -10 + float, 0, -16 + float, (tint as any)(0x0d0f14), a);
    b.primitive.pushTriangle(0, -16 + float, 6, -10 + float, 8, 8 + float, (tint as any)(0x0d0f14), a);
    b.primitive.pushTriangle(6, -10 + float, 8, 8 + float, -8, 8 + float, (tint as any)(0x0d0f14), a);
    // Inner hood: 3-point polygon
    b.primitive.pushTriangle(-6, -10 + float, 0, -16 + float, 6, -10 + float, (tint as any)(0x161a22), a);
    px(b, -3, -12 + float, 7, 5, 0xc8d3dc, a);
    px(b, -2, -11 + float, 2, 2, 0x8fd0e0, a);
    px(b, 1, -11 + float, 2, 2, 0x8fd0e0, a);
    let blade = 0;
    if (e.state === "wind") blade = -0.8;
    else if (e.state === "swing") blade = 0.9;
    else if (e.state === "stuck") blade = 1.3;
    const bx = Math.cos(blade) * 12, by = Math.sin(blade) * 12;
    b.primitive.pushLine(8, -4 + float, 8 + bx, -4 + float + by, 0x3a3226, a, 2);
    // Arc approximation: 8 line segments along the blade edge
    const arcCx = 8 + bx, arcCy = -4 + float + by, arcR = 6;
    const arcStart = blade + 1.6, arcEnd = blade + 3.4;
    const segs = 8;
    const dx0 = arcCx + arcR * Math.cos(arcStart), dy0 = arcCy + arcR * Math.sin(arcStart);
    const dx1 = arcCx + arcR * Math.cos(arcEnd), dy1 = arcCy + arcR * Math.sin(arcEnd);
    for (let i = 0; i < segs; i++) {
      const t0 = arcStart + (arcEnd - arcStart) * i / segs;
      const t1 = arcStart + (arcEnd - arcStart) * (i + 1) / segs;
      const ax0 = arcCx + arcR * Math.cos(t0), ay0 = arcCy + arcR * Math.sin(t0);
      const ax1 = arcCx + arcR * Math.cos(t1), ay1 = arcCy + arcR * Math.sin(t1);
      b.primitive.pushLine(ax0, ay0, ax1, ay1, (tint as any)(0xb9c2c9), a, 2);
    }
    if (e.state === "wind") {
      b.primitive.pushCircleStroke(0, -2 + float, 12 + Math.sin(time * 20) * 2, 0xe05050, 1, 0.4);
    }
  }
}
