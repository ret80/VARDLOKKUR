/* renderers/projectile/ArrowProjectileRenderer.ts */

import { Graphics } from "pixi.js";
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class ArrowProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: Graphics, data: IProjectileData, ctx: RenderContext): void {
    const { a, quad } = ctx as any;
    quad(a, [[-5, -0.5], [4, -0.5], [4, 0.5], [-5, 0.5]], 0x8a744a);
    quad(a, [[3, -1], [6, 0], [3, 1]], 0xb9c2c9);
    quad(a, [[-5, -1.5], [-3, -1.5], [-3, 1.5], [-5, 1.5]], 0xd8e2ea);
  }
}
