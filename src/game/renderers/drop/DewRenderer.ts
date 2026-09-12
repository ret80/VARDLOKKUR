/* renderers/drop/DewRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class DewRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4 + data.t) * 0.3;
    b.primitive.pushCircleStroke(0, -2 + bob, 5, 1, 0x8fd8e8, pulse * 0.4);
    px(b, -1, -4 + bob, 2, 3, 0x8fd8e8, pulse);
    px(b, -1, -1 + bob, 2, 1, 0xbdeef8, pulse);
    px(b, 0, -5 + bob, 1, 1, 0xbdeef8, pulse);
  }
}
