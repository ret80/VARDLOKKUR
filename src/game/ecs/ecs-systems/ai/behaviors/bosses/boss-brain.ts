/* boss-brain.ts — общий базовый класс боссов.
 *
 * Общее для всех боссов: поворот к игроку, контактный урон вплотную
 * и отметка смерти (`boss:killed`).
 */

import { Position, Enemy, Direction } from '../../../../ecs-components';
import { EnemyBrain, type AiContext } from '../../brain';

export { type AiContext } from '../../brain';

const CONTACT_REACH_BONUS = 5;
const CONTACT_PAD = 4;
const COMMON_CONTACT_DMG = 1;
const COMMON_CONTACT_COOLDOWN = 1.1;

export abstract class BossBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const d = this.faceAndDistToPlayer(ctx, eid);
    this.updateBoss(ctx, eid, d);
    this.checkCommonContact(ctx, eid, d);
    this.markBossDead(ctx, eid);
  }

  /** Основное поведение босса (машина состояний). */
  protected abstract updateBoss(ctx: AiContext, eid: number, d: number): void;

  /** Повернуться к игроку и вернуть расстояние до него. */
  protected faceAndDistToPlayer(ctx: AiContext, eid: number): number {
    const dx = ctx.playerX - Position[eid].x;
    const dy = ctx.playerY - Position[eid].y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      Direction[eid].x = dx / d;
      Direction[eid].y = dy / d;
    }
    return d;
  }

  /** Контактный урон вплотную (босс коснулся игрока). */
  protected checkCommonContact(ctx: AiContext, eid: number, d: number): void {
    if (Enemy[eid].contactCd <= 0 && d < Enemy[eid].radius + CONTACT_REACH_BONUS + CONTACT_PAD) {
      ctx.onPlayerDamaged(COMMON_CONTACT_DMG, Position[eid].x, Position[eid].y);
      Enemy[eid].contactCd = COMMON_CONTACT_COOLDOWN;
    }
  }
}
