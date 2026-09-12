/* renderers/drop/BearRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BearRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, -3 + bob, 6, 5, 0x6a5238);
    px(b, -3, -5 + bob, 6, 3, 0x7a6248);
    px(b, -4, -6 + bob, 2, 2, 0x6a5238);
    px(b, 2, -6 + bob, 2, 2, 0x6a5238);
    px(b, -1, -4 + bob, 1, 1, 0x0d1218);
    px(b, 1, -4 + bob, 1, 1, 0x0d1218);
  }
}
