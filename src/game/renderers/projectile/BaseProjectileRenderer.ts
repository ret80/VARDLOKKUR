/* renderers/projectile/BaseProjectileRenderer.ts — общий скелет отрисовки снарядов (SRP) */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IProjectileData } from "../../models";

/**
 * Базовый рендерер снарядов: rot-хелпер и quad-хелпер.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseProjectileRenderer implements Renderer<IProjectileData> {
  protected abstract drawBody(g: Graphics, data: IProjectileData, ctx: RenderContext): void;

  render(g: Graphics, data: IProjectileData, ctx: RenderContext): void {
    g.clear();
    const a = Math.atan2(data.vy, data.vx);
    const cos = Math.cos, sin = Math.sin;
    const rot = (x: number, y: number, ang: number): [number, number] =>
      [x * cos(ang) - y * sin(ang), x * sin(ang) + y * cos(ang)];
    const quad = (ang: number, pts: [number, number][], color: number) => {
      const r = pts.map((p0) => rot(p0[0], p0[1], ang));
      g.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) g.lineTo(r[i][0], r[i][1]);
      g.closePath().fill({ color });
    };
    this.drawBody(g, data, { ...ctx, a, rot, quad });
  }
}
