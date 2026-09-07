/* renderers/drop/AmberRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class AmberRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -2, -4 + bob, 4, 6, 0xc8822a);
    px(g, -1, -2 + bob, 2, 2, 0xf8d878);
    g.circle(0, -1 + bob, 6).stroke({ color: 0xe8c979, width: 1, alpha: 0.5 });
  }
}
