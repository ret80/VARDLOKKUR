/* renderers/projectile/AxeProjectileRenderer.ts */

import { Graphics } from "pixi.js";
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class AxeProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: Graphics, data: IProjectileData, ctx: RenderContext): void {
    const { quad } = ctx as any;
    quad(data.spin, [[-1, -5], [1, -5], [1, 4], [-1, 4]], 0x5a4632);
    quad(data.spin, [[-5, -5], [0, -5], [0, 0], [-5, 0]], 0x9fe0ee);
    g.circle(0, 0, 6).stroke({ color: 0x9fe0ee, width: 1, alpha: 0.3 });
  }
}
