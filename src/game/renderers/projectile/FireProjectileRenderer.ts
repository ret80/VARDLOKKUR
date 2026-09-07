/* renderers/projectile/FireProjectileRenderer.ts */

import { Graphics } from "pixi.js";
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class FireProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: Graphics, data: IProjectileData, ctx: RenderContext): void {
    const time = ctx.time;
    const fl = Math.sin(time * 20) * 1;
    g.circle(0, 0, 4 + fl).fill({ color: 0xe08a3c, alpha: 0.8 });
    g.circle(0, 0, 2).fill({ color: 0xf8d878 });
  }
}
