/* renderers/objects/AltarRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IAltarData } from "../../models";
import { px } from "../core/primitives";

export class AltarRenderer implements Renderer<IAltarData> {
  render(b: Batchers, data: IAltarData, ctx: RenderContext): void {
    const time = ctx.time;
    b.primitive.pushEllipse(0, 6, 8, 2, 0x05080d, 0.45);
    const eyeP = 0.7 + Math.sin(time * 2.5) * 0.3;
    b.primitive.pushCircle(0, -11, 5, 0xe8c979, 0.12);
    px(b, -6, 2, 12, 4, 0x241a10);
    px(b, -6, 2, 12, 1, 0x3a2c1c);
    for (let i = 0; i < 5; i++) {
      const on = i < data.runes;
      px(b, -5 + i * 2, 3, 1, 1, on ? 0x63d8c8 : 0x1d1610, on ? 0.9 : 1);
    }
    px(b, -3, -9, 6, 11, 0x5a4632);
    px(b, -3, -9, 2, 11, 0x6a543c);
    px(b, 2, -9, 1, 11, 0x3a2c1c);
    px(b, -4, -6, 8, 2, 0x4a3624);
    px(b, -4, -6, 1, 2, 0x6a543c);
    px(b, 3, -6, 1, 2, 0x6a543c);
    px(b, -1, -3, 2, 3, 0x63d8c8, 0.8);
    px(b, -1, -2, 1, 1, 0xbdeef8, 0.9);
    px(b, -4, -14, 8, 6, 0x6a543c);
    px(b, -4, -14, 8, 1, 0x7a6248);
    px(b, -4, -15, 8, 1, 0xeef6fc);
    px(b, -3, -12, 2, 2, 0xe8c979, eyeP);
    px(b, 1, -12, 2, 2, 0xe8c979, eyeP);
    px(b, -3, -12, 1, 1, 0xf8e0a0, eyeP);
    px(b, 1, -12, 1, 1, 0xf8e0a0, eyeP);
    px(b, -2, -10, 4, 1, 0x3a2c1c);
    px(b, -6, 1, 3, 1, 0xeef6fc);
    px(b, 3, 1, 3, 1, 0xeef6fc);
    if (data.runes >= 5) {
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      b.primitive.pushCircleStroke(0, -4, 14, 1.5, 0x63d8c8, pulse);
    }
  }
}
