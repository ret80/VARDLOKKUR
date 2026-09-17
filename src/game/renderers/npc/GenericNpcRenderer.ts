/* renderers/npc/GenericNpcRenderer.ts — общий вид человека по умолчанию */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { INpcData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { NpcRenderer } from "./NpcRenderer";

export class GenericNpcRenderer extends NpcRenderer {
  protected drawBody(g: GraphicsHandle, data: INpcData, ctx: RenderContext): void {
    const bob = Math.sin(ctx.time * 2 + data.id.length) * 0.5;
    const r: IRenderer = ctx.renderer!;
    px(r, g, -4, -8 + bob, 8, 12, 0x5c5248);
    px(r, g, -4, -8 + bob, 8, 2, 0x6c6258);
    px(r, g, -3, -14 + bob, 7, 6, 0xc8a88a);
    px(r, g, -3, -15 + bob, 7, 3, 0x4a3e32);
  }
}
