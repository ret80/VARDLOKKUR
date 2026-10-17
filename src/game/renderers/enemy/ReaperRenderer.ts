/* renderers/enemy/ReaperRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { drawPoly, drawEllipse, px, ring } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ReaperRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const { tint, a } = ctx as any;
    const time = ctx.time;
    const float = Math.sin(time * 2) * 2;

    // `tint` возвращает hex-число, а drawPoly/drawEllipse ждут объект Color.
    const col = (hex: number, alpha: number = a) => {
      const c = (tint as any)(hex) as number;
      return {
        r: ((c >> 16) & 0xff) / 255,
        g: ((c >> 8) & 0xff) / 255,
        b: (c & 0xff) / 255,
        a: alpha,
      };
    };

    drawEllipse(r, g, 0, 8, 9, 2.6, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.4 * a });

    // Тело — полигон
    drawPoly(r, g, [-8, 8 + float, -6, -10 + float, 0, -16 + float, 6, -10 + float, 8, 8 + float], col(0x0d0f14));
    drawPoly(r, g, [-6, -10 + float, 0, -16 + float, 6, -10 + float], col(0x161a22));

    px(r, g, -3, -12 + float, 7, 5, 0xc8d3dc, a);
    px(r, g, -2, -11 + float, 2, 2, 0x8fd0e0, a);
    px(r, g, 1, -11 + float, 2, 2, 0x8fd0e0, a);

    // Коса: замах/удар/застревание меняют угол лезвия.
    let blade = 0;
    if (e.state === "wind") blade = -0.8;
    else if (e.state === "swing") blade = 0.9;
    else if (e.state === "stuck") blade = 1.3;
    const tipX = 8 + Math.cos(blade) * 12;
    const tipY = -4 + float + Math.sin(blade) * 12;

    // Черенок косы (тёмное дерево, не тонируется)
    r.drawLine(g, 8, -4 + float, tipX, tipY, { r: 0x3a / 255, g: 0x32 / 255, b: 0x26 / 255, a }, 2);

    // Изогнутое лезвие — заполненный полумесяц по дуге вокруг острия
    const a0 = blade + 1.6, a1 = blade + 3.4;
    const R = 6, half = 1.1, N = 8;
    const pts: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = a0 + (a1 - a0) * (i / N);
      pts.push(tipX + Math.cos(t) * (R + half), tipY + Math.sin(t) * (R + half));
    }
    for (let i = N; i >= 0; i--) {
      const t = a0 + (a1 - a0) * (i / N);
      pts.push(tipX + Math.cos(t) * (R - half), tipY + Math.sin(t) * (R - half));
    }
    drawPoly(r, g, pts, col(0xb9c2c9));

    if (e.state === "wind") {
      // Красное кольцо-телеграф замаха
      ring(r, g, 0, -2 + float, 12 + Math.sin(time * 20) * 2, 0xe05050, 1, 0.4);
    }
  }
}
