/* renderers/drop/BonesRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BonesRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, 0 + bob, 7, 1, 0xcdd6dc);
    px(b, -4, -1 + bob, 2, 2, 0xcdd6dc);
    px(b, 3, -1 + bob, 2, 2, 0xcdd6dc);
    px(b, -1, -3 + bob, 4, 3, 0xb9c2c9);
  }
}
