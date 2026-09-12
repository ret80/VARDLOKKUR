/* renderers/drop/HammerRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HammerRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -1, -2 + bob, 2, 7, 0x5a4632);
    px(b, -4, -5 + bob, 8, 4, 0x63d8c8);
    px(b, -4, -5 + bob, 8, 1, 0xa8ece2);
    px(b, -2, -3 + bob, 1, 1, 0xe8c979);
    px(b, 2, -3 + bob, 1, 1, 0xe8c979);
  }
}
