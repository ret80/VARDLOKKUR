/* renderers/projectile/BoneArrowProjectileRenderer.ts — костяная стрела скелета-лучника */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IProjectileData } from "../../models";
import type { RenderContext } from "../core/types";
import { BaseProjectileRenderer } from "./BaseProjectileRenderer";

export class BoneArrowProjectileRenderer extends BaseProjectileRenderer {
  protected drawBody(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void {
    const { a, quad } = ctx as any;
    // a — угол полёта; quad поворачивает стрелу по траектории (острие вперёд)
    // древко
    quad(a, [[-5, -0.5], [4, -0.5], [4, 0.5], [-5, 0.5]], 0x9a7a4a);
    // костяной наконечник (острие по направлению полёта, +x)
    quad(a, [[3, -1.5], [6, 0], [3, 1.5]], 0xdfe6ee);
    // оперение (позади)
    quad(a, [[-5, -1.5], [-3, -1.5], [-3, 1.5], [-5, 1.5]], 0xcdc5b2);
  }
}
