/* renderers/objects/DoorRenderer.ts */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IDoorData } from "../../models";
import { px, clearGraphics } from "../core/primitives";

export class DoorRenderer implements Renderer<IDoorData> {
  render(g: GraphicsHandle, data: IDoorData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    clearGraphics(r, g);
    const t = 1 - data.open; // 1 — закрыта, 0 — открыта
    if (t <= 0.02) return;

    const body = data.locked ? 0x2c2420 : 0x39424e;
    const edge = data.locked ? 0x3a302a : 0x4e5a68;

    // dir: 0 = вниз, 1 = влево, 2 = вверх, 3 = вправо.
    // Проём сверху/снизу — горизонтальная створка, слева/справа — вертикальная.
    const horizontal = data.dir === 0 || data.dir === 2;
    if (horizontal) {
      const w = 16, h = 14 * t;
      px(r, g, -w / 2, -h / 2, w, h, body);
      px(r, g, -w / 2, -h / 2, w, 2, edge);
    } else {
      const w = 14 * t, h = 16;
      px(r, g, -w / 2, -h / 2, w, h, body);
      px(r, g, -w / 2, -h / 2, 2, h, edge);
    }

    if (data.locked) {
      px(r, g, -2, -2, 4, 4, 0xc9a24b);
      px(r, g, -1, -1, 2, 2, 0x0d1218);
    }
  }
}
