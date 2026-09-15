/* renderers/projectile/SporeProjectileRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class SporeProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void {
    const r = getRenderer();
    r.drawEllipse(g, 0, 0, 3, 3, { r: 0x8a / 255, g: 0xa8 / 255, b: 0x5a / 255, a: 0.8 });
    r.drawEllipse(g, 0, 0, 1.5, 1.5, { r: 0xb8 / 255, g: 0xd8 / 255, b: 0x78 / 255, a: 1 });
  }
}
