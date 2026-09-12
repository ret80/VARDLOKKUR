/* renderers/drop/AxeDropRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class AxeDropRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -1, -5 + bob, 2, 9, 0x5a4632);
    px(b, -4, -5 + bob, 4, 4, 0x9fe0ee);
    px(b, -4, -5 + bob, 4, 1, 0xbdeef8);
  }
}
