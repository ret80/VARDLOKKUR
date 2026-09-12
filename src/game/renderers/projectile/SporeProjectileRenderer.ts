/* renderers/projectile/SporeProjectileRenderer.ts */

import type { Batchers } from '../../engine/batcher-types.js';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class SporeProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(b: Batchers, data: IProjectileData, ctx: RenderContext): void {
    b.primitive.pushCircle(0, 0, 3, 0x8aa85a, 0.8);
    b.primitive.pushCircle(0, 0, 1.5, 0xb8d878);
  }
}
