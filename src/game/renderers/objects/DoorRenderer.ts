/* renderers/objects/DoorRenderer.ts */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IDoorData } from "../../models";
import { px } from "../core/primitives";

export class DoorRenderer implements Renderer<IDoorData> {
  render(g: Graphics, data: IDoorData, _ctx: RenderContext): void {
    g.clear();
    const h = 14 * (1 - data.open);
    if (h <= 0.5) return;
    px(g, -8, -h, 16, h, data.locked ? 0x2c2420 : 0x39424e);
    px(g, -8, -h, 16, 2, data.locked ? 0x3a302a : 0x4e5a68);
    if (data.locked) {
      px(g, -2, -h / 2 - 2, 4, 4, 0xc9a24b);
      px(g, -1, -h / 2 - 1, 2, 2, 0x0d1218);
    }
  }
}
