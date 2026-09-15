/* renderers/projectile/AxeProjectileRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class AxeProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void {
    const { quad } = ctx as any;
    quad(data.spin, [[-1, -5], [1, -5], [1, 4], [-1, 4]], 0x5a4632);
    quad(data.spin, [[-5, -5], [0, -5], [0, 0], [-5, 0]], 0x9fe0ee);
    const r = getRenderer();
    r.drawEllipse(g, 0, 0, 6, 6, { r: 0x9f / 255, g: 0xe0 / 255, b: 0xee / 255, a: 0.3 });
  }
}
