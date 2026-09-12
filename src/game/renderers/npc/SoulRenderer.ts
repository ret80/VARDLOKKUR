/* renderers/npc/SoulRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

// Triangulated Soul polygon (star shape): (-4,2) → (0,8) → (4,2) → (2,3) → (0,6) → (-2,3)
// Decomposed via ear clipping into 5 triangles
const TRIANGLES: [number, number, number, number, number, number][] = [
  [-4, 2, 0, 8, 4, 2],
  [-4, 2, 4, 2, -2, 3],
  [-4, 2, -2, 3, 0, 6],
  [4, 2, 2, 3, -2, 3],
  [4, 2, -2, 3, 0, 6],
];

export class SoulRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const time = ctx.time;
    const fl = Math.sin(time * 2.4) * 2.5;
    const a = 0.5 + Math.sin(time * 3.1) * 0.15;

    // Draw triangulated polygon
    for (const [x1, y1, x2, y2, x3, y3] of TRIANGLES) {
      b.primitive.pushTriangle(x1, y1 + fl, x2, y2 + fl, x3, y3 + fl, 0x8fd8e8, a * 0.5);
    }

    px(b, -4, -8 + fl, 9, 10, 0x8fd8e8, a * 0.75);
    px(b, -3, -11 + fl, 7, 4, 0xbdeef8, a);
    px(b, -2, -9 + fl, 2, 2, 0x0d1a24, a);
    px(b, 1, -9 + fl, 2, 2, 0x0d1a24, a);
    b.primitive.pushCircleStroke(0, -4 + fl, 8, 1, 0x8fd8e8, a * 0.35);
  }
}
