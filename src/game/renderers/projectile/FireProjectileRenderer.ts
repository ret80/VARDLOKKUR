/* renderers/projectile/FireProjectileRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class FireProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(b: Batchers, data: IProjectileData, ctx: RenderContext): void {
    const time = ctx.time;
    const fl = Math.sin(time * 20) * 1;
    b.primitive.pushCircle(0, 0, 4 + fl, 0xe08a3c, 0.8);
    b.primitive.pushCircle(0, 0, 2, 0xf8d878);
  }
}
