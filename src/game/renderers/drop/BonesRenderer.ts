/* renderers/drop/BonesRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BonesRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -3, 0 + bob, 7, 1, 0xcdd6dc);
    px(g, -4, -1 + bob, 2, 2, 0xcdd6dc);
    px(g, 3, -1 + bob, 2, 2, 0xcdd6dc);
    px(g, -1, -3 + bob, 4, 3, 0xb9c2c9);
  }
}
