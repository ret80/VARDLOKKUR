/* renderers/objects/PedestalRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Renderer, RenderContext } from "../core/types";
import type { IPedestalData } from "../../models";
import { px } from "../core/primitives";

export class PedestalRenderer implements Renderer<IPedestalData> {
  render(g: GraphicsHandle, data: IPedestalData, ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    const time = ctx.time;
    r.drawEllipse(g, 0, 7, 8, 2.6, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 });
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
      r.drawEllipse(g, 0, -9, 6, 6, { r: ((col >> 16) & 0xff) / 255, g: ((col >> 8) & 0xff) / 255, b: (col & 0xff) / 255, a: pulse * 0.6 });
    } else {
      px(g, -1, -11, 2, 4, 0x232c38);
    }
  }
}
