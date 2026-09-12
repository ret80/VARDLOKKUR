/* renderers/drop/BundleRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BundleRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(b, -3, -3 + bob, 6, 5, 0x8a744a);
    px(b, -3, -3 + bob, 6, 1, 0xa8925e);
    px(b, -1, -4 + bob, 2, 1, 0x5a4632);
  }
}
