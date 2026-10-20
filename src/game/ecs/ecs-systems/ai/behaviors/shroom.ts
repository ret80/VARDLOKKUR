/* shroom.ts — гриб: стреляет спорами, когда видит игрока. */

import { Position, Enemy, Direction, EnemyState } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const SIGHT_RANGE = 105;
const KEEP_DISTANCE = 40;
const SPORE_SPEED = 74;
const CHARGE_TIME = 0.7;
const COOLDOWN_TIME = 2.5;

export class ShroomBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const { dt, bus } = ctx;
    const px = Position[eid].x;
    const py = Position[eid].y;
    const d = Math.hypot(px - ctx.playerX, py - ctx.playerY);
    const sees = !!Enemy[eid].aggro && d * d < SIGHT_RANGE * SIGHT_RANGE;

    if (!sees) {
      Enemy[eid].state = EnemyState.idle;
      return;
    }

    // Смотрит на игрока, отходит если подошёл слишком близко
    Direction[eid].x = Math.sign(ctx.playerX - px) || 1;
    Direction[eid].y = 0;
    if (d < KEEP_DISTANCE) {
      this.setVelocity(eid, ((px - ctx.playerX) / d) * 40, ((py - ctx.playerY) / d) * 40);
    }

    // Зарядка → выстрел спорой → перезарядка
    Enemy[eid].stateT -= dt;
    if (Enemy[eid].state === EnemyState.cool) {
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.charge;
        Enemy[eid].stateT = CHARGE_TIME;
      }
    } else if (Enemy[eid].state !== EnemyState.charge) {
      Enemy[eid].state = EnemyState.charge;
      Enemy[eid].stateT = CHARGE_TIME;
    } else if (Enemy[eid].stateT <= 0) {
      Enemy[eid].state = EnemyState.cool;
      Enemy[eid].stateT = COOLDOWN_TIME;
      bus?.emit('projectile:fire', {
        kind: 'spore',
        x: px,
        y: py - 4,
        vx: ((ctx.playerX - px) / d) * SPORE_SPEED,
        vy: ((ctx.playerY - py) / d) * SPORE_SPEED,
        dmg: 1,
        owner: eid,
      });
    }
  }
}
