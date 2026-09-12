/* renderers/npc/RavenNpcRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class RavenNpcRenderer extends NpcRenderer {
  protected drawBody(b: Batchers, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const flap = Math.sin(ctx.time * 6) * 2;
    px(b, -3, -8 + bob + flap * 0.2, 6, 6, 0x1d232c);
    px(b, -2, -12 + bob, 5, 5, 0x242c38);
    px(b, 3, -11 + bob, 3, 2, 0xe8c979);
    px(b, 3, -11 + bob, 1, 1, 0x8fd8e8);
  }
}
