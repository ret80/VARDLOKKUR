/* renderers/projectile/FireProjectileRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class FireProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void {
    const time = ctx.time;
    const r = getRenderer();
    const fl = Math.sin(time * 20) * 1;
    r.drawEllipse(g, 0, 0, 4 + fl, 4 + fl, { r: 0xe0 / 255, g: 0x8a / 255, b: 0x3c / 255, a: 0.8 });
    r.drawEllipse(g, 0, 0, 2, 2, { r: 0xf8 / 255, g: 0xd8 / 255, b: 0x78 / 255, a: 1 });
  }
}
