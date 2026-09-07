/* renderers/drop/SwordDropRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class SwordDropRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -1, -6 + bob, 2, 8, 0xb9c2c9);
    px(g, -1, -6 + bob, 1, 8, 0xd8e2ea);
    px(g, -3, 1 + bob, 6, 1, 0x5a4632);
    px(g, -1, 2 + bob, 2, 2, 0x3a3226);
  }
}
