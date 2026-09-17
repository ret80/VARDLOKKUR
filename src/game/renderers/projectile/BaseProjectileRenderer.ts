/* renderers/projectile/BaseProjectileRenderer.ts — общий скелет отрисовки снарядов (SRP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import type { Renderer, RenderContext } from "../core/types";
import type { IProjectileData } from "../../models";

/**
 * Базовый рендерер снарядов: rot-хелпер и quad-хелпер.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseProjectileRenderer implements Renderer<IProjectileData> {
  protected abstract drawBody(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void;

  render(g: GraphicsHandle, data: IProjectileData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    r.clearGraphics(g);
    const a = Math.atan2(data.vy, data.vx);
    const cos = Math.cos, sin = Math.sin;
    const rot = (x: number, y: number, ang: number): [number, number] =>
      [x * cos(ang) - y * sin(ang), x * sin(ang) + y * cos(ang)];
    const quad = (ang: number, pts: [number, number][], color: number) => {
      const rotated = pts.map((p0) => rot(p0[0], p0[1], ang));
      const flat = rotated.flatMap(p => p);
      r.drawPoly(g, flat, {
        r: ((color >> 16) & 0xff) / 255,
        g: ((color >> 8) & 0xff) / 255,
        b: (color & 0xff) / 255,
        a: 1,
      });
    };
    this.drawBody(g, data, { ...ctx, a, rot, quad });
  }
}
