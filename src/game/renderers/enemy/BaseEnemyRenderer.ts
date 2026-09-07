/* renderers/enemy/BaseEnemyRenderer.ts — общий скелет отрисовки врагов (SRP) */

import { Graphics } from "pixi.js";
import type { Renderer, RenderContext } from "../core/types";
import type { IEnemyData } from "../../models";
import { px } from "../core/primitives";

/**
 * Базовый рендерер врагов: тень, bob, tint(flash/frozen), alpha(hidden*fade), hp-бар.
 * Дочерние классы реализуют только тело через template method `drawBody`.
 */
export abstract class BaseEnemyRenderer implements Renderer<IEnemyData> {
  protected abstract drawBody(g: Graphics, data: IEnemyData, ctx: RenderContext): void;

  render(g: Graphics, data: IEnemyData, ctx: RenderContext): void {
    g.clear();
    if (data.dead) return;

    const e = data;
    const flash = e.flashT > 0;
    const frozen = e.freezeT > 0;
    const tint = (c: number) => (flash ? 0xffffff : frozen ? 0x9fd8e8 : c);
    const a = (e.hidden ? 0.25 : 1) * e.fade;

    // общая тень
    g.ellipse(0, 5, 6, 2.2).fill({ color: 0x05080d, alpha: 0.5 * a });

    this.drawBody(g, data, { ...ctx, tint, a });

    // общий hp-бар (кроме snake)
    if (e.hp < e.maxHp && e.kind !== "snake") {
      const wdt = e.r * 2;
      px(g, -wdt / 2, -e.r - 9, wdt, 2, 0x0a0f16, 0.8);
      px(g, -wdt / 2, -e.r - 9, wdt * (e.hp / e.maxHp), 2, 0xe05050, 0.9);
    }
  }
}
