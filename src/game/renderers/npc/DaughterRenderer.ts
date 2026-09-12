/* renderers/npc/DaughterRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

// Triangulated Daughter polygon: (-4,4) → (-3,-8) → (3,-8) → (4,4) → (3,3) → (0,6) → (-2,3)
// Decomposed via ear clipping into 4 triangles
const TRIANGLES: [number, number, number, number, number, number][] = [
  [-3, -8, 3, -8, 4, 4],
  [-3, -8, 4, 4, -2, 3],
  [-4, 4, -3, -8, -2, 3],
  [-4, 4, -2, 3, 0, 6],
];

export class DaughterRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const time = ctx.time;
    const a = 0.6 + Math.sin(time * 2.5) * 0.15;

    // Draw triangulated polygon
    for (const [x1, y1, x2, y2, x3, y3] of TRIANGLES) {
      b.primitive.pushTriangle(x1, y1 + bob, x2, y2 + bob, x3, y3 + bob, 0x8fb0c8, a * 0.5);
    }

    px(b, -3, -13 + bob, 7, 6, 0xc8d8e8, a);
    px(b, -3, -14 + bob, 7, 3, 0x4a3e5c, a);
    px(b, -1, -11 + bob, 1, 1, 0x2a3444, a);
    px(b, 1, -11 + bob, 1, 1, 0x2a3444, a);
  }
}
