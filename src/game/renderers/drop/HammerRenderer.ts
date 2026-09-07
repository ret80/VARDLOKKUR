/* renderers/drop/HammerRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class HammerRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -1, -2 + bob, 2, 7, 0x5a4632);
    px(g, -4, -5 + bob, 8, 4, 0x63d8c8);
    px(g, -4, -5 + bob, 8, 1, 0xa8ece2);
    px(g, -2, -3 + bob, 1, 1, 0xe8c979);
    px(g, 2, -3 + bob, 1, 1, 0xe8c979);
  }
}
