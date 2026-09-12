/* renderers/drop/BowRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BowRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    // Bow arc
    b.primitive.pushArc(0, -2 + bob, 5, -1.3, 1.3, 0x8a744a, 2);
    // String line
    b.primitive.pushLine(3.5, -5.6 + bob, 3.5, 1.6 + bob, 0xd8e2ea, 1, 1);
  }
}
