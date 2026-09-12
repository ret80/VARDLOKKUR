/* renderers/drop/ArrowsDropRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class ArrowsDropRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -2, -4 + bob, 1, 7, 0x8a744a);
    px(b, -2, -5 + bob, 1, 2, 0xb9c2c9);
    px(b, 1, -2 + bob, 1, 6, 0x8a744a);
    px(b, 1, -3 + bob, 1, 2, 0xb9c2c9);
  }
}
