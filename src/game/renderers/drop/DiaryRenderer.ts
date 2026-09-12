/* renderers/drop/DiaryRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class DiaryRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, -4 + bob, 6, 6, 0x6a5238);
    px(b, -3, -4 + bob, 1, 6, 0x4a3826);
    px(b, -1, -3 + bob, 3, 1, 0xc9a684);
    px(b, -1, -1 + bob, 3, 1, 0xc9a684);
  }
}
