/* renderers/enemy/BaseEnemyRenderer.ts — общий скелет отрисовки врагов (SRP) */

import type { GraphicsHandle, IRenderer } from '../../renderer/IRenderer';
import { CacheStrategy } from "../core/types";
import type { Renderer, RenderContext } from "../core/types";
import type { IEnemyData } from "../../models";
import { px } from "../core/primitives";

/**
 * Базовый рендерер врагов: тень, bob, tint(flash/frozen), alpha(hidden*fade), hp-бар.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 *
 * Использует GraphicsHandle — все детали PixiJS скрыты в IRenderer.
 */
export abstract class BaseEnemyRenderer implements Renderer<IEnemyData> {
  protected abstract drawBody(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void;

  readonly strategy: CacheStrategy = CacheStrategy.REALTIME_GRAPHICS;

  render(g: GraphicsHandle, data: IEnemyData, ctx: RenderContext): void {
    const r = ctx.renderer!;
    r.clearGraphics(g);
    if (data.dead) return;

    const e = data;
    const flash = e.flashT > 0;
    const frozen = e.freezeT > 0;
    const tint = (c: number) => (flash ? 0xffffff : frozen ? 0x9fd8e8 : c);
    const a = (e.hidden ? 0.25 : 1) * e.fade;

    // общая тень
    r.drawEllipse(g, 0, 5, 6, 2.2, { r: 0x05 / 255, g: 0x08 / 255, b: 0x0d / 255, a: 0.5 * a });

    this.drawBody(g, data, { ...ctx, tint, a });

    // общий hp-бар (кроме snake)
    if (e.hp < e.maxHp && e.kind !== "snake") {
      const wdt = e.r * 2;
      px(r, g, -wdt / 2, -e.r - 9, wdt, 2, 0x0a0f16, 0.8);
      px(r, g, -wdt / 2, -e.r - 9, wdt * (e.hp / e.maxHp), 2, 0xe05050, 0.9);
    }
  }

  /**
   * Нужно ли обновлять текстуру?
   * Проверяем ключевые поля, влияющие на визуал.
   */
  needsTextureUpdate(data: IEnemyData, prevData: IEnemyData | null): boolean {
    if (!prevData) return true;
    return (
      data.state !== prevData.state ||
      data.t !== prevData.t ||
      data.flashT !== prevData.flashT ||
      data.freezeT !== prevData.freezeT ||
      data.hidden !== prevData.hidden ||
      data.fade !== prevData.fade ||
      data.aggro !== prevData.aggro ||
      data.hp !== prevData.hp ||
      data.lungeT !== prevData.lungeT ||
      data.x !== prevData.x ||
      data.y !== prevData.y
    );
  }
}
