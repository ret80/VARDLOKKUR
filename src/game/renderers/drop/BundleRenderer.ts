/* renderers/drop/BundleRenderer.ts */

import { Graphics } from "pixi.js";
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BundleRenderer extends BaseDropRenderer {
  protected drawBody(g: Graphics, data: IDropData, ctx: RenderContext): void {
    const bob = (ctx as any).bob;
    px(g, -3, -3 + bob, 6, 5, 0x8a744a);
    px(g, -3, -3 + bob, 6, 1, 0xa8925e);
    px(g, -1, -4 + bob, 2, 1, 0x5a4632);
  }
}
