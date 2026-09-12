/* renderers/drop/AmberRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class AmberRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -2, -4 + bob, 4, 6, 0xc8822a);
    px(b, -1, -2 + bob, 2, 2, 0xf8d878);
    b.primitive.pushCircleStroke(0, -1 + bob, 6, 1, 0xe8c979, 0.5);
  }
}
