/* renderers/player/PlayerRenderer.ts — отрисовка игрока (SRP) */

import type { GraphicsHandle } from '../../renderer/IRenderer';
import { getRenderer } from '../../renderer/RendererFactory';
import { CacheStrategy } from "../core/types";
import type { Renderer, RenderContext } from "../core/types";
import type { IPlayerData, IPlayerExtra } from "../../models";
import { px } from "../core/primitives";

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
    const r = getRenderer();
    r.clearGraphics(g);
    this.drawBody(g, data);
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

  private drawBody(g: GraphicsHandle, data: PlayerRenderData): void {
    const p = data.data;
    const extra = data.extra;
    const time = (data as any).ctx?.time ?? data.data.animT;
    const bob = p.moving ? Math.sin(p.animT * 12) * 1.2 : Math.sin(time * 2) * 0.4;
    const legSwing = p.moving ? Math.sin(p.animT * 12) * 2.5 : 0;

    const f = p.dir.x > 0.3 ? 1 : p.dir.x < -0.3 ? -1 : 0;

    const r = getRenderer();
    // Тень
    r.drawEllipse(g, 0, 5, 6, 2.4, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 });

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
      // Меч — полигон
      r.drawPoly(g, [
        hx * 5, -4 + bob + hy * 5,
        hx * 13, -4 + bob + hy * 13,
        hx * 13 + -hy * 2, -4 + bob + hy * 13 + hx * 2,
        hx * 5 + -hy * 2, -4 + bob + hy * 5 + hx * 2
      ], { r: 0xb9 / 255, g: 0xc2 / 255, b: 0xc9 / 255, a: 1 });
      // Дуга замаха — аппроксимация эллипсом
      const arcR = 14 * (1 - prog * 0.3);
      r.drawEllipse(g, 0, -4 + bob, arcR, arcR, { r: 0xe8 / 255, g: 0xf4 / 255, b: 0xfc / 255, a: 0.5 * (1 - prog) });
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
      // Прицел — аппроксимация эллипсом
      r.drawEllipse(g, Math.cos(a) * 11, -4 + bob + Math.sin(a) * 11, 6, 6, { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: 0.7 });
      // Линия прицела — полигон
      r.drawPoly(g, [
        Math.cos(a) * 8, -4 + bob + Math.sin(a) * 8,
        Math.cos(a) * 14, -4 + bob + Math.sin(a) * 14,
        Math.cos(a) * 14 + -Math.sin(a) * 1.5, -4 + bob + Math.sin(a) * 14 + Math.cos(a) * 1.5
      ], { r: 0xe8 / 255, g: 0xc9 / 255, b: 0x79 / 255, a: 0.9 });
    }

    if (p.slowT > 0) {
      // Заморозка — аппроксимация эллипсом
      r.drawEllipse(g, 0, -4 + bob, 9, 9, { r: 0x9f / 255, g: 0xe0 / 255, b: 0xee / 255, a: 0.5 });
    }
  }

  // ── Утилиты ─────────────────────────────────────────────────────

  private snapshot(data: PlayerRenderData): PlayerVisualSnapshot {
    const p = data.data;
    return {
      dirX: p.dir.x,
      dirY: p.dir.y,
      moving: p.moving,
      animT: p.animT,
      swingT: p.swingT,
      hurtT: p.hurtT,
      slowT: p.slowT,
      hasSword: data.extra.hasSword,
      runes: data.extra.runes,
      aiming: data.extra.aiming,
    };
  }
}
