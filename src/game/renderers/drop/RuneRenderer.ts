/* renderers/drop/RuneRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class RuneRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    px(b, -3, -5 + bob, 6, 8, 0x4e5a68);
    px(b, -2, -4 + bob, 4, 6, 0x63d8c8, pulse);
    px(b, -1, -3 + bob, 1, 4, 0x0d2a26);
    px(b, 0, -2 + bob, 2, 1, 0x0d2a26);
    b.primitive.pushCircleStroke(0, -1 + bob, 7, 1, 0x63d8c8, pulse * 0.5);
  }
}
