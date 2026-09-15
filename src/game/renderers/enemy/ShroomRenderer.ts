/* renderers/enemy/ShroomRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

export class ShroomRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;

    const r = getRenderer();
    r.drawEllipse(g, 0, 4, 5, 2, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 * a });
    px(g, -2, -2 + bob, 5, 6, 0xb9b0a0, a);
    const charge = e.state === "charge" ? 1 + Math.sin(e.t * 20) * 0.1 : 1;
    const capColor = (tint as any)(0x6a4a5c);
    const capC = typeof capColor === 'number' ? { r: (capColor >> 16 & 0xff) / 255, g: (capColor >> 8 & 0xff) / 255, b: (capColor & 0xff) / 255, a } : capColor;
    r.drawEllipse(g, 0, -4 + bob, 7 * charge, 5 * charge, capC);
    const dimColor = (tint as any)(0x7d5a6e);
    const dc = typeof dimColor === 'number' ? { r: (dimColor >> 16 & 0xff) / 255, g: (dimColor >> 8 & 0xff) / 255, b: (dimColor & 0xff) / 255, a } : dimColor;
    r.drawEllipse(g, 0, -6 + bob, 5 * charge, 2.5 * charge, dc);
    px(g, -3, -5 + bob, 1, 1, 0xe8dcc0, a);
    px(g, 2, -4 + bob, 1, 1, 0xe8dcc0, a);
    px(g, -1, -2 + bob, 1, 1, 0x2a2228, a);
    px(g, 2, -2 + bob, 1, 1, 0x2a2228, a);
  }
}
