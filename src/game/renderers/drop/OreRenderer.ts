/* renderers/drop/OreRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class OreRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -4, -3 + bob, 8, 5, 0x5a6570);
    px(g, -3, -5 + bob, 6, 3, 0x6a7580);
    px(g, -2, -4 + bob, 2, 2, 0xe08a3c);
    px(g, 1, -2 + bob, 2, 2, 0xe08a3c);
    g.circle(0, -2 + bob, 6).stroke({ color: 0xe08a3c, width: 1, alpha: 0.4 });
  }
}
