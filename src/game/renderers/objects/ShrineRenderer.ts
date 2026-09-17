/* renderers/objects/ShrineRenderer.ts */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IShrineData } from "../../models";
import { px, ell, clearGraphics } from "../core/primitives";

export class ShrineRenderer implements Renderer<IShrineData> {
  render(g: GraphicsHandle, data: IShrineData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    clearGraphics(r, g);
    const time = ctx.time;
    ell(r, g, 0, 4, 6, 1.5, 0x05080d, 0.5);
    px(r, g, -2, -11, 4, 1, 0xc8d3dc);
    px(r, g, -3, -10, 6, 1, 0x39424e);
    px(r, g, -4, -9, 8, 11, 0x232c38);
    px(r, g, -4, -9, 2, 11, 0x2c3642);
    px(r, g, 3, -9, 1, 11, 0x141a22);
    px(r, g, -5, 2, 10, 2, 0x1a222c);
    px(r, g, -1, -8, 2, 1, 0x0a0e14);
    px(r, g, -2, -7, 4, 4, 0x0a0e14);
    if (data.lit) {
      const fl = Math.round(Math.sin(time * 8) * 0.7);
      ell(r, g, 0, -5, 4, 4, 0x8fd8e8, 0.18);
      px(r, g, -1, -6 + fl, 2, 3, 0x8fd8e8, 0.9);
      px(r, g, 0, -7 + fl, 1, 2, 0xbdeef8);
    }
  }
}
