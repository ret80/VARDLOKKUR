/* renderers/drop/MossRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class MossRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, -2 + bob, 6, 3, 0x4a6a3a);
    px(b, -2, -4 + bob, 2, 3, 0x6a8a4a);
    px(b, 1, -3 + bob, 2, 2, 0x8aa85a);
  }
}
