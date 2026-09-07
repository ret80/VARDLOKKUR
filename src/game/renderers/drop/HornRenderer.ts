/* renderers/drop/HornRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HornRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    g.moveTo(-3, -4 + bob).lineTo(3, -1 + bob).lineTo(2, 2 + bob).lineTo(-3, 0 + bob).closePath().fill(0xc9a24b);
    px(g, -3, -4 + bob, 2, 4, 0xe8c979);
  }
}
