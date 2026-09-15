/* renderers/enemy/RavenRenderer.ts */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

/** Конвертация hex-цвета в Color {r, g, b, a} */
function hexColor(hex: number, alpha: number = 1): { r: number; g: number; b: number; a: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
    a: alpha,
  };
}

export class RavenRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const flap = Math.sin(e.t * 16) * 4;
    const fx = e.facing.x >= 0 ? 1 : -1;

    px(g, -3, -3 + bob, 6, 5, (tint as any)(0x1d232c), a);
    px(g, -2, -6 + bob, 5, 4, (tint as any)(0x242c38), a);
    px(g, fx * 3, -5 + bob, 3 * fx, 2, 0xe8c979, a);
    px(g, fx * 2, -6 + bob, 1, 1, 0xe05050, a);
    
    // Крылья — полигоны
    const r = getRenderer();
    const wingColor = (tint as any)(0x161c24);
    const wc = typeof wingColor === 'number' ? hexColor(wingColor, a) : wingColor;
    r.drawPoly(g, [-3, -2 + bob, -9, -4 + bob - flap, -4, 1 + bob], wc);
    r.drawPoly(g, [3, -2 + bob, 9, -4 + bob - flap, 4, 1 + bob], wc);
  }
}
