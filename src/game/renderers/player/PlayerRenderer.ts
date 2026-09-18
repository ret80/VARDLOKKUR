/* renderers/player/PlayerRenderer.ts — отрисовка игрока (SRP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import { CacheStrategy } from "../core/types";
import type { Renderer, RenderContext } from "../core/types";
import type { IPlayerData, IPlayerExtra } from "../../models";
import { px, ell, clearGraphics, drawPoly } from "../core/primitives";
import { logger } from '../../debug/logger';

export interface PlayerRenderData {
  data: IPlayerData;
  extra: IPlayerExtra;
}

/** Ключевые поля для детекции изменений визуала */
interface PlayerVisualSnapshot {
  dirX: number; dirY: number;
  moving: boolean;
  animT: number;
  swingT: number;
  hurtT: number;
  slowT: number;
  hasSword: boolean;
  runes: number;
  aiming: boolean;
}

export class PlayerRenderer implements Renderer<PlayerRenderData> {
  readonly strategy: CacheStrategy = CacheStrategy.DYNAMIC_TEXTURE;

  render(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    clearGraphics(r, g);
    this.drawBody(g, data, ctx);
  }

  /** Нужно ли обновлять текстуру? */
  needsTextureUpdate(data: PlayerRenderData, prevData: PlayerRenderData | null): boolean {
    if (!prevData) return true;
    const snap = this.snapshot(data);
    const prevSnap = this.snapshot(prevData);

    return (
      snap.dirX !== prevSnap.dirX ||
      snap.dirY !== prevSnap.dirY ||
      snap.moving !== prevSnap.moving ||
      snap.animT !== prevSnap.animT ||
      snap.swingT !== prevSnap.swingT ||
      snap.hurtT !== prevSnap.hurtT ||
      snap.slowT !== prevSnap.slowT ||
      snap.aiming !== prevSnap.aiming
    );
  }

  // ── Рисование тела (общее для render и renderToContainer) ────────

  private drawBody(g: GraphicsHandle, data: PlayerRenderData, ctx: RenderContext): void {
    const r = ctx.renderer;
    if (!r) {
      logger.warn('player-render', `drawBody: ctx.renderer is undefined, skipping`);
      return;
    }
    const p = data.data;
    const extra = data.extra;
    const time = ctx.time ?? data.data.animT;
    const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
    const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;

    const f = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;

    // Тень
    ell(r, g, 0, 5, 6, 2.4, 0x05080d, 0.5);

    px(r, g, -4, 1 + legSwing * 0.3, 3, 4, 0x2c3038, 1);
    px(r, g, 1, 1 - legSwing * 0.3, 3, 4, 0x2c3038, 1);

    const cape = Math.sin(time * 3) * 1;
    if (f >= 0) {
      px(r, g, -6 + cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(r, g, -5 + cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    } else {
      px(r, g, 2 - cape * 0.3, -8 + bob, 4, 11, 0x3d4a5c, 1);
      px(r, g, 3 - cape * 0.3, -8 + bob, 2, 11, 0x4a5a70, 1);
    }

    px(r, g, -4, -8 + bob, 8, 9, 0x4e5a68, 1);
    px(r, g, -4, -8 + bob, 8, 2, 0x5c6875, 1);
    px(r, g, -4, -1 + bob, 8, 2, 0x3a3226, 1);
    if (extra.runes > 0) px(r, g, -3, -1 + bob, Math.min(6, extra.runes * 2), 1, 0x63d8c8, 1);

    if (f >= 0) {
      px(r, g, -3, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(r, g, -4, -15 + bob, 9, 3, 0x2c3038, 1);
      px(r, g, -4, -13 + bob, 1, 4, 0x2c3038, 1);
    } else {
      px(r, g, -4, -14 + bob, 7, 6, 0xc8a88a, 1);
      px(r, g, -5, -15 + bob, 9, 3, 0x2c3038, 1);
      px(r, g, 3, -13 + bob, 1, 4, 0x2c3038, 1);
    }
    if (f >= 0) {
      px(r, g, -2, -9 + bob, 5, 2, 0x8a7a62, 1);
    } else {
      px(r, g, -3, -9 + bob, 5, 2, 0x8a7a62, 1);
    }
    const ex = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;
    if (ex > 0) {
      px(r, g, 0, -12 + bob, 1, 1, 0x0d1218, 1);
      px(r, g, 3, -12 + bob, 1, 1, 0x0d1218, 1);
    } else if (ex < 0) {
      px(r, g, -3, -12 + bob, 1, 1, 0x0d1218, 1);
      px(r, g, 0, -12 + bob, 1, 1, 0x0d1218, 1);
    } else {
      px(r, g, -1, -12 + bob, 1, 1, 0x0d1218, 1);
      px(r, g, 2, -12 + bob, 1, 1, 0x0d1218, 1);
    }

    if (extra.hasSword && p.swingT > 0) {
      const prog = 1 - p.swingT / 0.22;
      const baseA = Math.atan2(extra.swingDir.y, extra.swingDir.x);
      const sweep = baseA - 1.1 + prog * 2.2;
      const hx = Math.cos(sweep), hy = Math.sin(sweep);
      // Меч — полигон
      const blade = f >= 0
        ? [-3 + hx * 10, -14 + bob + hy * 10, -1 + hx * 10, -14 + bob + hy * 10, 0, -12 + bob]
        : [-4 + hx * 10, -14 + bob + hy * 10, -2 + hx * 10, -14 + bob + hy * 10, -1, -12 + bob];
      drawPoly(r, g, blade, { r: 200 / 255, g: 211 / 255, b: 220 / 255, a: 1 });
    }
  }

  private snapshot(data: PlayerRenderData): PlayerVisualSnapshot {
    const { data: p, extra } = data;
    return {
      dirX: p.dir.x,
      dirY: p.dir.y,
      moving: p.moving,
      animT: p.animT,
      swingT: p.swingT,
      hurtT: p.hurtT,
      slowT: p.slowT,
      hasSword: extra.hasSword,
      runes: extra.runes,
      aiming: extra.aiming,
    };
  }
}
