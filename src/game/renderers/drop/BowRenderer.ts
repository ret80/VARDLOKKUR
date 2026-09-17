/* renderers/drop/BowRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IDropData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseDropRenderer } from "./BaseDropRenderer";

export class BowRenderer extends BaseDropRenderer {
  protected drawBody(g: GraphicsHandle, data: IDropData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    const bob = (ctx as any).bob;
    // Лук — аппроксимация эллипсом
    r.drawEllipse(g, 0, -2 + bob, 5, 5, { r: 0x8a / 255, g: 0x74 / 255, b: 0x4a / 255, a: 2 });
    // Струна — полигон (линия)
    r.drawPoly(g, [3.5, -5.6 + bob, 3.5, 1.6 + bob], { r: 0xd8 / 255, g: 0xe2 / 255, b: 0xea / 255, a: 1 });
  }
}
