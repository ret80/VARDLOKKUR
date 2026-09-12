/* renderers/drop/HeartRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HeartRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, -3 + bob, 2, 2, 0xe05070);
    px(b, 1, -3 + bob, 2, 2, 0xe05070);
    px(b, -3, -1 + bob, 6, 2, 0xe05070);
    px(b, -2, 1 + bob, 4, 1, 0xe05070);
    px(b, -1, 2 + bob, 2, 1, 0xe05070);
  }
}
