/* renderers/player/PlayerRenderer.ts — отрисовка игрока (SRP) */

import type { Batchers } from '../../engine/batcher-types.js';
import type { Renderer, RenderContext } from "../core/types";
import type { IPlayerData, IPlayerExtra } from "../../models";
import { px } from "../core/primitives";

export interface PlayerRenderData {
  data: IPlayerData;
  extra: IPlayerExtra;
}

export class PlayerRenderer implements Renderer<PlayerRenderData> {

  render(b: Batchers, data: PlayerRenderData, ctx: RenderContext): void {
    this.drawBody(b, data);
  }

  private drawBody(b: Batchers, data: PlayerRenderData): void {
    const p = data.data;
    const extra = data.extra;
    const time = p.animT;
    const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
    const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;

    const f = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;

    b.primitive.pushEllipse(0, 5, 6, 2.4, 0x05080d, 0.5);

    px(b, -4, 1 + legSwing * 0.3, 3, 4, 0x2c3038, 1);
    px(b, 1, 1 - legSwing * 0.3, 3, 4, 0x2c3038, 1);

    const cape = Math.sin(time * 3) * 1;
    if (f >= 0) {
      px(b, -6 + cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(b, -5 + cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    } else {
      px(b, 2 - cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(b, 3 - cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    }

    px(b, -4, -8 + bob, 8, 9, 0x4e5a68, 1);
    px(b, -4, -8 + bob, 8, 2, 0x5c6875, 1);
    px(b, -4, -1 + bob, 8, 2, 0x3a3226, 1);
    if (extra.runes > 0) px(b, -3, -1 + bob, Math.min(6, extra.runes * 2), 1, 0x63d8c8, 1);

    if (f >= 0) {
      px(b, -3, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(b, -4, -15 + bob, 9, 3, 0x2c3038, 1);
      px(b, -4, -13 + bob, 1, 4, 0x2c3038, 1);
    } else {
      px(b, -4, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(b, -5, -15 + bob, 9, 3, 0x2c3038, 1);
      px(b, 3, -13 + bob, 1, 4, 0x2c3038, 1);
    }
    if (f >= 0) {
      px(b, -2, -9 + bob, 5, 2, 0x8a7a62, 1);
    } else {
      px(b, -3, -9 + bob, 5, 2, 0x8a7a62, 1);
    }
    const ex = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;
    if (ex > 0) {
      px(b, 0, -12 + bob, 1, 1, 0x0d1218, 1);
      px(b, 3, -12 + bob, 1, 1, 0x0d1218, 1);
    } else if (ex < 0) {
      px(b, -3, -12 + bob, 1, 1, 0x0d1218, 1);
      px(b, 0, -12 + bob, 1, 1, 0x0d1218, 1);
    } else {
      px(b, -1, -12 + bob, 1, 1, 0x0d1218, 1);
      px(b, 2, -12 + bob, 1, 1, 0x0d1218, 1);
    }

    if (extra.hasSword && p.swingT > 0) {
      const prog = 1 - p.swingT / 0.22;
      const baseA = Math.atan2(extra.swingDir.y, extra.swingDir.x);
      const sweep = baseA - 1.1 + prog * 2.2;
      const hx = Math.cos(sweep), hy = Math.sin(sweep);
      const bx = hx * 5, by = -4 + bob + hy * 5;
      const tx = hx * 13, ty = -4 + bob + hy * 13;
      const ox = -hy * 2, oy = hx * 2;
      // Blade quad → 2 triangles
      b.primitive.pushTriangle(bx, by, tx, ty, tx + ox, ty + oy, 0xb9c2c9, 1);
      b.primitive.pushTriangle(bx, by, tx + ox, ty + oy, bx + ox, by + oy, 0xb9c2c9, 1);
      // Swing arc
      b.primitive.pushArc(0, -4 + bob, 14, -(baseA - 1.2 + prog * 2.4), -(baseA - 1.2), 0xe8f4fc, 1.5, 0.5 * (1 - prog));
    } else if (extra.hasSword) {
      if (f >= 0) {
        px(b, 5, -10 + bob, 2, 8, 0xb9c2c9, 1);
        px(b, 4, -4 + bob, 4, 1, 0x5a4632, 1);
      } else {
        px(b, -7, -10 + bob, 2, 8, 0xb9c2c9, 1);
        px(b, -8, -4 + bob, 4, 1, 0x5a4632, 1);
      }
    }

    if (extra.aiming) {
      const a = Math.atan2(p.dir.y, p.dir.x);
      b.primitive.pushArc(0, -4 + bob, 10, -(a + 0.6), -(a - 0.6), 0xe8c979, 1, 0.7);
      b.primitive.pushLine(Math.cos(a) * 8, -4 + bob + Math.sin(a) * 8, Math.cos(a) * 14, -4 + bob + Math.sin(a) * 14, 0xe8c979, 0.9, 1.5);
    }

    if (p.slowT > 0) {
      b.primitive.pushCircleStroke(0, -4 + bob, 9, 1, 0x9fe0ee, 0.5);
    }
  }
}
