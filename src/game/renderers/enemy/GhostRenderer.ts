/* renderers/enemy/GhostRenderer.ts */

import { Graphics } from "pixi.js";
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class GhostRenderer extends BaseEnemyRenderer {
  protected drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const time = ctx.time;
    const { tint, a } = ctx as any;
    const float = Math.sin(time * 2.2 + e.seed) * 2;
    const aggr = e.aggro && e.state !== "dissipate";
    const BODY = 0xcfdce8, HI = 0xeef6fc, DK = 0x9fb4c8;

    px(g, -2, -12 + float, 4, 1, HI, a);
    px(g, -3, -11 + float, 6, 1, BODY, a);
    px(g, -4, -10 + float, 8, 2, BODY, a);
    px(g, -4, -8 + float, 8, 7, BODY, a);
    px(g, -4, -8 + float, 1, 7, HI, a);
    px(g, 3, -8 + float, 1, 7, DK, a);
    px(g, -2, -9 + float, 4, 3, 0x0d1a24, a);
    const eye = aggr ? 0xe05050 : 0x6a8aa4;
    px(g, -2, -8 + float, 1, 1, eye, a);
    px(g, 1, -8 + float, 1, 1, eye, a);
    if (aggr) px(g, -1, -7 + float, 2, 1, 0x0d1a24, a);
    px(g, -5, -6 + float, 1, 3, BODY, a);
    px(g, 4, -6 + float, 1, 3, BODY, a);
    px(g, -4, -1 + float, 2, 2, DK, a);
    px(g, -1, -1 + float, 2, 3, DK, a);
    px(g, 2, -1 + float, 2, 2, DK, a);
    px(g, -1, 2 + float, 2, 1, DK, a * 0.7);
  }
}
