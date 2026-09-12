/* renderers/npc/HaraldRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class HaraldRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    px(b, -5, -8 + bob, 10, 12, 0x6a5a4a);
    px(b, -5, -8 + bob, 10, 3, 0x4e5a68);
    px(b, -3, -14 + bob, 7, 6, 0xc8a88a);
    px(b, -3, -9 + bob, 7, 3, 0x5a4632);
    px(b, 5, -12 + bob, 2, 10, 0x39424e);
  }
}
