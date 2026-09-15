/* renderers/objects/AltarRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { Renderer, RenderContext } from "../core/types";
import type { IAltarData } from "../../models";
import { px } from "../core/primitives";

export class AltarRenderer implements Renderer<IAltarData> {
  render(g: GraphicsHandle, data: IAltarData, ctx: RenderContext): void {
    const r = getRenderer();
    r.clearGraphics(g);
    const time = ctx.time;
    r.drawEllipse(g, 0, 6, 8, 2, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.45 });
    const eyeP = 0.7 + Math.sin(time * 2.5) * 0.3;
    r.drawEllipse(g, 0, -11, 5, 5, { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: 0.12 });
    px(g, -6, 2, 12, 4, 0x241a10);
    px(g, -6, 2, 12, 1, 0x3a2c1c);
    for (let i = 0; i < 5; i++) {
      const on = i < data.runes;
      px(g, -5 + i * 2, 3, 1, 1, on ? 0x63d8c8 : 0x1d1610, on ? 0.9 : 1);
    }
    px(g, -3, -9, 6, 11, 0x5a4632);
    px(g, -3, -9, 2, 11, 0x6a543c);
    px(g, 2, -9, 1, 11, 0x3a2c1c);
    px(g, -4, -6, 8, 2, 0x4a3624);
    px(g, -4, -6, 1, 2, 0x6a543c);
    px(g, 3, -6, 1, 2, 0x6a543c);
    px(g, -1, -3, 2, 3, 0x63d8c8, 0.8);
    px(g, -1, -2, 1, 1, 0xbdeef8, 0.9);
    px(g, -4, -14, 8, 6, 0x6a543c);
    px(g, -4, -14, 8, 1, 0x7a6248);
    px(g, -4, -15, 8, 1, 0xeef6fc);
    px(g, -3, -12, 2, 2, 0xe8c979, eyeP);
    px(g, 1, -12, 2, 2, 0xe8c979, eyeP);
    px(g, -3, -12, 1, 1, 0xf8e0a0, eyeP);
    px(g, 1, -12, 1, 1, 0xf8e0a0, eyeP);
    px(g, -2, -10, 4, 1, 0x3a2c1c);
    px(g, -6, 1, 3, 1, 0xeef6fc);
    px(g, 3, 1, 3, 1, 0xeef6fc);
    if (data.runes >= 5) {
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      r.drawEllipse(g, 0, -4, 14, 14, { r: 0x63 / 255, g: 0xd8 / 255, b: 0xc8 / 255, a: pulse });
    }
  }
}
