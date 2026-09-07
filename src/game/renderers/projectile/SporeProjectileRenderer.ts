/* renderers/projectile/SporeProjectileRenderer.ts */

import { Graphics } from "pixi.js";
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class SporeProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: Graphics, data: IProjectileData, ctx: RenderContext): void {
    g.circle(0, 0, 3).fill({ color: 0x8aa85a, alpha: 0.8 });
    g.circle(0, 0, 1.5).fill({ color: 0xb8d878 });
  }
}
