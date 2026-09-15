/* renderers/objects/ShrineRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Renderer, RenderContext } from "../core/types";
import type { IShrineData } from "../../models";
import { px } from "../core/primitives";

export class ShrineRenderer implements Renderer<IShrineData> {
  render(g: GraphicsHandle, data: IShrineData, ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    const time = ctx.time;
    r.drawEllipse(g, 0, 4, 6, 1.5, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 });
    px(g, -2, -11, 4, 1, 0xc8d3dc);
    px(g, -3, -10, 6, 1, 0x39424e);
    px(g, -4, -9, 8, 11, 0x232c38);
    px(g, -4, -9, 2, 11, 0x2c3642);
    px(g, 3, -9, 1, 11, 0x141a22);
    px(g, -5, 2, 10, 2, 0x1a222c);
    px(g, -1, -8, 2, 1, 0x0a0e14);
    px(g, -2, -7, 4, 4, 0x0a0e14);
    if (data.lit) {
      const fl = Math.round(Math.sin(time * 8) * 0.7);
      r.drawEllipse(g, 0, -5, 4, 4, { r: 0x8f / 255, g: 0xd8 / 255, b: 0xe8 / 255, a: 0.18 });
      px(g, -1, -6 + fl, 2, 3, 0x8fd8e8, 0.9);
      px(g, 0, -7 + fl, 1, 2, 0xbdeef8);
    }
  }
}
