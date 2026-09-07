/* renderers/drop/MeadRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class MeadRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -2, -4 + bob, 5, 6, 0xc8822a);
    px(g, -2, -4 + bob, 5, 2, 0xe8a84a);
    px(g, -1, -5 + bob, 3, 1, 0x8a744a);
  }
}
