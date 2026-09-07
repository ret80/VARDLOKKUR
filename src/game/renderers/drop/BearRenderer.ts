/* renderers/drop/BearRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BearRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -3, -3 + bob, 6, 5, 0x6a5238);
    px(g, -3, -5 + bob, 6, 3, 0x7a6248);
    px(g, -4, -6 + bob, 2, 2, 0x6a5238);
    px(g, 2, -6 + bob, 2, 2, 0x6a5238);
    px(g, -1, -4 + bob, 1, 1, 0x0d1218);
    px(g, 1, -4 + bob, 1, 1, 0x0d1218);
  }
}
