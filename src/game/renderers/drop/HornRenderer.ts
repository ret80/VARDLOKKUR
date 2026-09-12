/* renderers/drop/HornRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HornRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    // Horn body - polygon (4 points → 2 triangles)
    b.primitive.pushTriangle(-3, -4 + bob, 3, -1 + bob, 2, 2 + bob, 0xc9a24b);
    b.primitive.pushTriangle(-3, -4 + bob, 2, 2 + bob, -3, 0 + bob, 0xc9a24b);
    px(b, -3, -4 + bob, 2, 4, 0xe8c979);
  }
}
