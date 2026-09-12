/* renderers/drop/FlowerRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class FlowerRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -1, -1 + bob, 1, 4, 0x5a7a4a);
    px(b, -3, -5 + bob, 2, 2, 0xc8d8e8);
    px(b, 1, -5 + bob, 2, 2, 0xc8d8e8);
    px(b, -1, -7 + bob, 2, 2, 0xc8d8e8);
    px(b, -1, -5 + bob, 2, 2, 0xe8c979);
  }
}
