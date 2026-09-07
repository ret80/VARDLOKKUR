/* renderers/objects/PedestalRenderer.ts */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IPedestalData } from "../../models";
import { px } from "../core/primitives";

export class PedestalRenderer implements Renderer<IPedestalData> {
  render(g: Graphics, data: IPedestalData, ctx: RenderContext): void {
    g.clear();
    const time = ctx.time;
    g.ellipse(0, 7, 8, 2.6).fill({ color: 0x05080d, alpha: 0.5 });
    px(g, -6, 2, 12, 4, 0x4e5a68);
    px(g, -6, 2, 12, 1, 0x5c6875);
    px(g, -4, -6, 8, 8, 0x39424e);
    px(g, -4, -6, 8, 1, 0x4e5a68);
    px(g, -2, -12, 4, 6, 0x4e5a68);
    if (!data.taken) {
      const sealed = data.guardsLeft > 0;
      const col = sealed ? 0xe05050 : 0x63d8c8;
      const core = sealed ? 0xf8a0a0 : 0xbdeef8;
      const pulse = 0.6 + Math.sin(time * (sealed ? 5 : 3)) * 0.4;
      px(g, -1, -11, 2, 4, col, pulse);
      px(g, -1, -10, 1, 2, core, pulse);
      g.circle(0, -9, 6).stroke({ color: col, width: 1, alpha: pulse * 0.6 });
    } else {
      px(g, -1, -11, 2, 4, 0x232c38);
    }
  }
}
