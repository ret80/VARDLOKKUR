/* renderers/drop/AxeDropRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class AxeDropRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -1, -5 + bob, 2, 9, 0x5a4632);
    px(g, -4, -5 + bob, 4, 4, 0x9fe0ee);
    px(g, -4, -5 + bob, 4, 1, 0xbdeef8);
  }
}
