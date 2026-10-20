/* snake.ts — босс «Ёрмунганд»: closed → open фазы, стреляет огнём из пасти.
 *
 * Змей не двигается; смерть обрабатывается отдельно (damageSnake в combat-system),
 * поэтому босс-база (markBossDead) здесь не используется.
 */

import { Position, Enemy, EnemyState } from '../../../../ecs-components';
import { EnemyBrain, type AiContext } from '../../brain';

const CLOSED_TIME = 3.8;
const OPEN_TIME = 3.0;
const FIRE_SPEED = 84;

export class SnakeBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const { dt, bus } = ctx;

    // Snake doesn't move
    this.stop(eid);

    Enemy[eid].stateT -= dt;

    // Пасть: исходный код использовал `Math.sin(0 * 1.6)` — рот строго по центру.
    const mouthX = Position[eid].x;
    const mouthY = Position[eid].y - 2;

    if (Enemy[eid].state === EnemyState.closed) {
      if (Enemy[eid].stateT <= 1.5 && Enemy[eid].seed > 0.5) {
        Enemy[eid].seed = 0.2;
        // 3 огненных снаряда веером в сторону игрока
        if (bus) {
          const base = Math.atan2(ctx.playerY - mouthY, ctx.playerX - mouthX);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.3;
            bus.emit('projectile:fire', {
              kind: 'fire', x: mouthX, y: mouthY,
              vx: Math.cos(a) * FIRE_SPEED, vy: Math.sin(a) * FIRE_SPEED,
              dmg: 1, owner: eid,
            });
          }
        }
      }
      if (Enemy[eid].stateT <= 0.7 && Enemy[eid].seed < 0.5) {
        Enemy[eid].seed = -1;
      }
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.open;
        Enemy[eid].stateT = OPEN_TIME;
      }
    } else if (Enemy[eid].state === EnemyState.open) {
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.closed;
        Enemy[eid].stateT = CLOSED_TIME;
        Enemy[eid].seed = 1;
      }
    } else {
      // Default: start closed
      Enemy[eid].state = EnemyState.closed;
      Enemy[eid].stateT = CLOSED_TIME;
      Enemy[eid].seed = 1;
    }
  }
}
