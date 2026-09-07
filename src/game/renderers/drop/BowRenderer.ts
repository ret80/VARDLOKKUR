/* renderers/drop/BowRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BowRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    g.arc(0, -2 + bob, 5, -1.3, 1.3).stroke({ color: 0x8a744a, width: 2 });
    g.moveTo(3.5, -5.6 + bob).lineTo(3.5, 1.6 + bob).stroke({ color: 0xd8e2ea, width: 1 });
  }
}
