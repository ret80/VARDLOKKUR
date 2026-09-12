/* renderers/npc/AstridRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class AstridRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    px(b, -4, -8 + bob, 8, 12, 0x4a6a5a);
    px(b, -4, -8 + bob, 8, 2, 0x5a7a6a);
    px(b, -3, -14 + bob, 7, 6, 0xc8a88a);
    px(b, -4, -15 + bob, 9, 4, 0x8a5a3a);
    px(b, -2, -6 + bob, 4, 4, 0x6a8a7a);
  }
}
