/* renderers/player/PlayerRenderer.ts — отрисовка игрока (SRP) */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IPlayerData, IPlayerExtra } from "../../models";
import { px } from "../core/primitives";

export interface PlayerRenderData {
  data: IPlayerData;
  extra: IPlayerExtra;
}

export class PlayerRenderer implements Renderer<PlayerRenderData> {
  render(g: Graphics, data: PlayerRenderData, ctx: RenderContext): void {
    g.clear();
    const p = data.data;
    const extra = data.extra;
    const time = ctx.time;
    const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
    const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;

    const f = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;

    g.ellipse(0, 5, 6, 2.4).fill({ color: 0x05080d, alpha: 0.5 });

    px(g, -4, 1 + legSwing * 0.3, 3, 4, 0x2c3038, 1);
    px(g, 1, 1 - legSwing * 0.3, 3, 4, 0x2c3038, 1);

    const cape = Math.sin(time * 3) * 1;
    if (f >= 0) {
      px(g, -6 + cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(g, -5 + cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    } else {
      px(g, 2 - cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(g, 3 - cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    }

    px(g, -4, -8 + bob, 8, 9, 0x4e5a68, 1);
    px(g, -4, -8 + bob, 8, 2, 0x5c6875, 1);
    px(g, -4, -1 + bob, 8, 2, 0x3a3226, 1);
    if (extra.runes > 0) px(g, -3, -1 + bob, Math.min(6, extra.runes * 2), 1, 0x63d8c8, 1);

    if (f >= 0) {
      px(g, -3, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(g, -4, -15 + bob, 9, 3, 0x2c3038, 1);
      px(g, -4, -13 + bob, 1, 4, 0x2c3038, 1);
    } else {
      px(g, -4, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(g, -5, -15 + bob, 9, 3, 0x2c3038, 1);
      px(g, 3, -13 + bob, 1, 4, 0x2c3038, 1);
    }
    if (f >= 0) {
      px(g, -2, -9 + bob, 5, 2, 0x8a7a62, 1);
    } else {
      px(g, -3, -9 + bob, 5, 2, 0x8a7a62, 1);
    }
    const ex = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;
    if (ex > 0) {
      px(g, 0, -12 + bob, 1, 1, 0x0d1218, 1);
      px(g, 3, -12 + bob, 1, 1, 0x0d1218, 1);
    } else if (ex < 0) {
      px(g, -3, -12 + bob, 1, 1, 0x0d1218, 1);
      px(g, 0, -12 + bob, 1, 1, 0x0d1218, 1);
    } else {
      px(g, -1, -12 + bob, 1, 1, 0x0d1218, 1);
      px(g, 2, -12 + bob, 1, 1, 0x0d1218, 1);
    }

    if (extra.hasSword && p.swingT > 0) {
      const prog = 1 - p.swingT / 0.22;
      const baseA = Math.atan2(extra.swingDir.y, extra.swingDir.x);
      const sweep = baseA - 1.1 + prog * 2.2;
      const hx = Math.cos(sweep), hy = Math.sin(sweep);
      g.moveTo(hx * 5, -4 + bob + hy * 5)
        .lineTo(hx * 13, -4 + bob + hy * 13)
        .lineTo(hx * 13 + -hy * 2, -4 + bob + hy * 13 + hx * 2)
        .lineTo(hx * 5 + -hy * 2, -4 + bob + hy * 5 + hx * 2)
        .closePath().fill({ color: 0xb9c2c9, alpha: 1 });
      g.arc(0, -4 + bob, 14, baseA - 1.2, baseA - 1.2 + prog * 2.4)
        .stroke({ color: 0xe8f4fc, width: 1.5, alpha: 0.5 * (1 - prog) });
    } else if (extra.hasSword) {
      if (f >= 0) {
        px(g, 5, -10 + bob, 2, 8, 0xb9c2c9, 1);
        px(g, 4, -4 + bob, 4, 1, 0x5a4632, 1);
      } else {
        px(g, -7, -10 + bob, 2, 8, 0xb9c2c9, 1);
        px(g, -8, -4 + bob, 4, 1, 0x5a4632, 1);
      }
    }

    if (extra.aiming) {
      const a = Math.atan2(p.dir.y, p.dir.x);
      g.arc(0, -4 + bob, 10, a - 0.6, a + 0.6).stroke({ color: 0xe8c979, width: 1, alpha: 0.7 });
      g.moveTo(Math.cos(a) * 8, -4 + bob + Math.sin(a) * 8)
        .lineTo(Math.cos(a) * 14, -4 + bob + Math.sin(a) * 14)
        .stroke({ color: 0xe8c979, width: 1.5, alpha: 0.9 });
    }

    if (p.slowT > 0) {
      g.circle(0, -4 + bob, 9).stroke({ color: 0x9fe0ee, width: 1, alpha: 0.5 });
    }
  }
}
