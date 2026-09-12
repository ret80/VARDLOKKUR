/* renderers/drop/OreRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class OreRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -4, -3 + bob, 8, 5, 0x5a6570);
    px(b, -3, -5 + bob, 6, 3, 0x6a7580);
    px(b, -2, -4 + bob, 2, 2, 0xe08a3c);
    px(b, 1, -2 + bob, 2, 2, 0xe08a3c);
    b.primitive.pushCircleStroke(0, -2 + bob, 6, 1, 0xe08a3c, 0.4);
  }
}
