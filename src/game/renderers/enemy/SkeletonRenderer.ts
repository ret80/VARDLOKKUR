/* renderers/enemy/SkeletonRenderer.ts — скелет мечник (ближний бой) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";

/** Палитра костей (общая для обоих скелетов). */
export const BONE = { light: 0xece6d6, mid: 0xcdc5b2, dark: 0x9a917d, socket: 0x14171d };
/** Палитра меча. */
const SWORD = { blade: 0xc6d0dd, hi: 0xeef2f7, guard: 0x7a6238, grip: 0x54402a };

export class SkeletonRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const { tint, a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 8) * 2;
    const fx = e.facing.x >= 0 ? 1 : -1;
    const attacking = e.state === "swing" || e.state === "wind";
    const t = (c: number) => (tint as any)(c) as number;

    // ноги
    px(r, g, -3, 1 + step * 0.3, 2, 4, BONE.dark, a);
    px(r, g, 1, 1 - step * 0.3, 2, 4, BONE.mid, a);
    // таз
    px(r, g, -3, -1 + bob, 6, 2, BONE.mid, a);
    px(r, g, -3, -1 + bob, 1, 1, BONE.socket, a);
    px(r, g, 2, -1 + bob, 1, 1, BONE.socket, a);
    // рёбра
    px(r, g, -4, -8 + bob, 8, 7, BONE.mid, a);
    for (const y of [-6, -4, -2]) {
      px(r, g, -3, y + bob, 2, 1, BONE.socket, a);
      px(r, g, 1, y + bob, 2, 1, BONE.socket, a);
    }
    // шея + череп
    px(r, g, -1, -9 + bob, 2, 1, BONE.dark, a);
    px(r, g, -3, -15 + bob, 6, 6, t(BONE.light), a);
    px(r, g, -2, -13 + bob, 1, 2, BONE.socket, a);
    px(r, g, 1, -13 + bob, 1, 2, BONE.socket, a);
    px(r, g, -1, -11 + bob, 2, 1, BONE.socket, a);
    px(r, g, -2, -10 + bob, 4, 1, BONE.socket, a);
    px(r, g, -1, -10 + bob, 1, 1, BONE.light, a);
    px(r, g, 1, -10 + bob, 1, 1, BONE.light, a);
    // задняя рука
    px(r, g, -5, -8 + bob, 2, 5, BONE.dark, a);

    if (attacking) {
      // выпад: клинок горизонтально вперёд
      px(r, g, 3, -9 + bob, 4, 2, BONE.mid, a);
      px(r, g, 6, -10 + bob, 2, 2, BONE.light, a);
      px(r, g, 8, -11 + bob, 1, 5, SWORD.guard, a);
      px(r, g, 9, -10 + bob, 8, 2, SWORD.blade, a);
      px(r, g, 9, -10 + bob, 8, 1, SWORD.hi, a);
      px(r, g, 17, -10 + bob, 1, 2, SWORD.hi, a);
    } else {
      // стойка: меч вертикально
      px(r, g, 3 * fx, -8 + bob, 2, 5, BONE.mid, a);
      px(r, g, 3 * fx, -3 + bob, 3, 2, BONE.light, a);
      px(r, g, 4 * fx - (fx < 0 ? 1 : 0), -4 + bob, 2, 3, SWORD.grip, a);
      px(r, g, 3 * fx - (fx < 0 ? 1 : 0), -5 + bob, 4, 1, SWORD.guard, a);
      px(r, g, 4 * fx - (fx < 0 ? 1 : 0), -14 + bob, 2, 9, SWORD.blade, a);
      px(r, g, 4 * fx - (fx < 0 ? 1 : 0), -14 + bob, 1, 9, SWORD.hi, a);
      px(r, g, 5 * fx - (fx < 0 ? 1 : 0), -15 + bob, 1, 1, SWORD.hi, a);
    }
  }
}
