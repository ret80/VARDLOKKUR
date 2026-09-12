/* renderers/npc/EirikRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class EirikRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    px(b, -4, -8 + bob, 8, 12, 0x5a4a6a);
    px(b, -4, -8 + bob, 8, 2, 0x6a5a7a);
    px(b, -3, -14 + bob, 7, 6, 0xc8a88a);
    px(b, -3, -15 + bob, 7, 2, 0xd8d3c8);
    px(b, -2, -9 + bob, 5, 3, 0xe8e3d8);
    px(b, 0, -12 + bob, 1, 1, 0x0d1218);
    px(b, -5, -10 + bob, 2, 14, 0x4a3e2e);
  }
}
