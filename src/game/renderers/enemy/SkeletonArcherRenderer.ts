/* renderers/enemy/SkeletonArcherRenderer.ts — скелет лучник (стрельба с дистанции) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import type { IEnemyData } from "../../models";
import type { RenderContext } from "../core/types";
import { px } from "../core/primitives";
import { BaseEnemyRenderer } from "./BaseEnemyRenderer";
import { BONE } from "./SkeletonRenderer";

/** Палитра лука/колчана. */
const ARCH = { bow: 0x8a6438, string: 0xded7c6, shaft: 0x9a7a4a, head: 0xdfe6ee, leather: 0x6b4f2c };

/** Лук: вертикальная дуга (1px), выгнутая вперёд (в сторону fx), с наконечниками. */
function bowCurve(
  g: GraphicsHandle, r: any, ymin: number, ymax: number, xTip: number, curve: number, bob: number
): void {
  const span = ymax - ymin;
  for (let y = ymin; y < ymax; y++) {
    const tt = ((y - ymin) / span) * 2 - 1;
    const x = xTip + Math.round(curve * (1 - tt * tt));
    px(r, g, x, y + bob, 1, 1, ARCH.bow);
  }
}

export class SkeletonArcherRenderer extends BaseEnemyRenderer {
  protected drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const e = data;
    const r = ctx.renderer!;
    const { a } = ctx as any;
    const bob = Math.sin(ctx.time * 3 + e.seed) * 0.8;
    const step = Math.sin(e.t * 8) * 2;
    const fx = e.facing.x >= 0 ? 1 : -1;
    const drawing = e.state === "aim";
    const M = (x: number) => x * fx;

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
    px(r, g, -3, -15 + bob, 6, 6, BONE.light, a);
    px(r, g, -2, -13 + bob, 1, 2, BONE.socket, a);
    px(r, g, 1, -13 + bob, 1, 2, BONE.socket, a);
    px(r, g, -1, -11 + bob, 2, 1, BONE.socket, a);
    px(r, g, -2, -10 + bob, 4, 1, BONE.socket, a);
    px(r, g, -1, -10 + bob, 1, 1, BONE.light, a);
    px(r, g, 1, -10 + bob, 1, 1, BONE.light, a);
    // колчан за спиной (контражур к направлению взгляда)
    px(r, g, M(-6), -9 + bob, 3, 6, ARCH.leather, a);
    px(r, g, M(-6), -12 + bob, 1, 3, BONE.light, a);
    px(r, g, M(-4), -12 + bob, 1, 3, ARCH.head, a);
    px(r, g, -4, -7 + bob, 8, 1, ARCH.leather, a); // ремень
    // задняя (натягивающая) рука
    px(r, g, M(-5), -8 + bob, 2, 5, BONE.dark, a);

    if (drawing) {
      // прицел: лук поднят, тетива натянута, стрела наложена
      bowCurve(g, r, M(5), -16, -2, 4, bob);
      px(r, g, M(5), -16 + bob, 1, 15, ARCH.string, a);
      px(r, g, M(3), -10 + bob, 5, 2, BONE.mid, a);
      px(r, g, M(7), -11 + bob, 2, 3, BONE.light, a);
      px(r, g, M(-2), -10 + bob, 4, 2, BONE.dark, a);
      px(r, g, M(2), -10 + bob, 2, 2, BONE.light, a);
      px(r, g, M(5), -9 + bob, 9, 1, ARCH.shaft, a);
      px(r, g, M(14), -10 + bob, 1, 1, ARCH.head, a);
      px(r, g, M(14), -9 + bob, 2, 1, ARCH.head, a);
      px(r, g, M(14), -8 + bob, 1, 1, ARCH.head, a);
    } else {
      // лук опущен, стрела не наложена
      bowCurve(g, r, M(4), -11, 5, 4, bob);
      px(r, g, M(4), -11 + bob, 1, 16, ARCH.string, a);
      px(r, g, M(3), -8 + bob, 2, 5, BONE.mid, a);
      px(r, g, M(5), -4 + bob, 3, 2, BONE.light, a);
    }
  }
}
