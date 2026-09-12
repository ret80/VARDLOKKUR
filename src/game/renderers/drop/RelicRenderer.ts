/* renderers/drop/RelicRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class RelicRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const pulse = 0.7 + Math.sin(time * 4) * 0.3;
    px(b, -2, -6 + bob, 4, 7, 0x8f9aa8);
    px(b, -2, -6 + bob, 4, 1, 0xc8d3dc);
    px(b, -1, -4 + bob, 2, 3, 0x63d8c8, pulse);
    b.primitive.pushCircleStroke(0, -2 + bob, 7, 1, 0x63d8c8, pulse * 0.5);
  }
}
