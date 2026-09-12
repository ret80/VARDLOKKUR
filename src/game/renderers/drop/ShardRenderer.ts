/* renderers/drop/ShardRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class ShardRenderer extends BaseDropRenderer {
  protected drawBody(b: Batchers, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    const time = ctx.time;
    const gl = 0.7 + Math.sin(time * 3 + data.t) * 0.3;
    // Shard polygon (5 points → 3 triangles)
    b.primitive.pushTriangle(0, -8 + bob, 3, -2 + bob, 1, 2 + bob, 0x9fc8dc, gl);
    b.primitive.pushTriangle(0, -8 + bob, 1, 2 + bob, -2, 2 + bob, 0x9fc8dc, gl);
    b.primitive.pushTriangle(0, -8 + bob, -2, 2 + bob, -3, -3 + bob, 0x9fc8dc, gl);
    px(b, -1, -6 + bob, 1, 5, 0xe8f4fc, gl * 0.9);
  }
}
