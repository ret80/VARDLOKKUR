/* renderers/drop/SwordDropRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class SwordDropRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -1, -6 + bob, 2, 8, 0xb9c2c9);
    px(b, -1, -6 + bob, 1, 8, 0xd8e2ea);
    px(b, -3, 1 + bob, 6, 1, 0x5a4632);
    px(b, -1, 2 + bob, 2, 2, 0x3a3226);
  }
}
