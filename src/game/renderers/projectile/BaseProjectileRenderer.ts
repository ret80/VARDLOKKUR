/* renderers/projectile/BaseProjectileRenderer.ts — общий скелет отрисовки снарядов (SRP)

   Этап 4: мигрирован на Batchers вместо PixiJS Graphics.
   quad() хелпер рисует 4 точки как 2 треугольника с поворотом.
*/

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IProjectileData } from "../../models";

/**
 * Базовый рендерер снарядов: rot-хелпер и quad-хелпер.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseProjectileRenderer implements Renderer<IProjectileData> {
  protected abstract drawBody(b: Batchers, data: IProjectileData, ctx: RenderContext): void;

  render(b: Batchers, data: IProjectileData, ctx: RenderContext): void {
    const a = Math.atan2(data.vy, data.vx);
    const cos = Math.cos, sin = Math.sin;
    const rot = (x: number, y: number, ang: number): [number, number] =>
      [x * cos(ang) - y * sin(ang), x * sin(ang) + y * cos(ang)];
    
    // quad: 4 точки → 2 треугольника с поворотом
    const quad = (ang: number, pts: [number, number][], color: number) => {
      const r = pts.map((p0) => rot(p0[0], p0[1], ang));
      // 2 треугольника из 4 точек (квадрат/параллелограмм)
      b.primitive.pushTriangle(r[0][0], r[0][1], r[1][0], r[1][1], r[2][0], r[2][1], color);
      b.primitive.pushTriangle(r[0][0], r[0][1], r[2][0], r[2][1], r[3][0], r[3][1], color);
    };
    
    this.drawBody(b, data, { ...ctx, a, rot, quad });
  }
}
