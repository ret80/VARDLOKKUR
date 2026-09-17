/* renderers/drop/OreRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class OreRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    px(r, g, -4, -3 + bob, 8, 5, 0x5a6570);
    px(r, g, -3, -5 + bob, 6, 3, 0x6a7580);
    px(r, g, -2, -4 + bob, 2, 2, 0xe08a3c);
    px(r, g, 1, -2 + bob, 2, 2, 0xe08a3c);
    r.drawEllipse(g, 0, -2 + bob, 6, 6, { r: 0xe0 / 255, g: 0x8a / 255, b: 0x3c / 255, a: 0.4 });
  }
}
