/* renderers/objects/ShrineRenderer.ts */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IShrineData } from "../../models";
import { px } from "../core/primitives";

export class ShrineRenderer implements Renderer<IShrineData> {
  render(g: Graphics, data: IShrineData, ctx: RenderContext): void {
    g.clear();
    const time = ctx.time;
    g.ellipse(0, 4, 6, 1.5).fill({ color: 0x05080d, alpha: 0.5 });
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
      g.circle(0, -5, 4).fill({ color: 0x8fd8e8, alpha: 0.18 });
      px(g, -1, -6 + fl, 2, 3, 0x8fd8e8, 0.9);
      px(g, 0, -7 + fl, 1, 2, 0xbdeef8);
    }
  }
}
