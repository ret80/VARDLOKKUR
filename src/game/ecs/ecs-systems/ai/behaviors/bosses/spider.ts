/* spider.ts — босс «Паук»: enter → aim → ring (веер и кольцо спор). */

import { Position, Enemy, EnemyState } from '../../../../ecs-components';
import { BossBrain } from './boss-brain';
import type { AiContext } from '../../brain';

const AIM_TIME = 1.2;
const RING_TIME = 1.8;
const AIM_AGAIN_TIME = 1.4;
const FAN_SPORE_SPEED = 110;
const RING_SPORE_SPEED = 85;
const RING_SPORE_COUNT = 8;
const CONTACT_COOLDOWN = 1.1;

export class SpiderBrain extends BossBrain {
  protected updateBoss(ctx: AiContext, eid: number): void {
    const { dt, bus } = ctx;
    const px = Position[eid].x;
    const py = Position[eid].y;

    Enemy[eid].stateT -= dt;
    this.stop(eid);

    if (Enemy[eid].state === EnemyState.enter) {
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.aim;
        Enemy[eid].stateT = AIM_TIME;
      }
    } else if (Enemy[eid].state === EnemyState.aim) {
      if (Enemy[eid].stateT <= 0) {
        // Веер спор в сторону игрока
        if (bus) {
          const base = Math.atan2(ctx.playerY - py, ctx.playerX - px);
          bus.emit('projectile:fire', {
            kind: 'spore', x: px, y: py - 6,
            vx: Math.cos(base) * FAN_SPORE_SPEED, vy: Math.sin(base) * FAN_SPORE_SPEED,
            dmg: 1, owner: eid,
          });
        }
        Enemy[eid].state = EnemyState.ring;
        Enemy[eid].stateT = RING_TIME;
      }
    } else if (Enemy[eid].state === EnemyState.ring) {
      if (Enemy[eid].stateT <= 0) {
        // Кольцо спор во все стороны
        if (bus) {
          for (let i = 0; i < RING_SPORE_COUNT; i++) {
            const a = ((Math.PI * 2) / RING_SPORE_COUNT) * i;
            bus.emit('projectile:fire', {
              kind: 'spore', x: px, y: py - 6,
              vx: Math.cos(a) * RING_SPORE_SPEED, vy: Math.sin(a) * RING_SPORE_SPEED,
              dmg: 1, owner: eid,
            });
          }
        }
        Enemy[eid].state = EnemyState.aim;
        Enemy[eid].stateT = AIM_AGAIN_TIME;
      }
    }
  }

  /** Паук не наносит контактного урона — только сбрасывает кулдаун. */
  protected checkCommonContact(_ctx: AiContext, eid: number, d: number): void {
    if (Enemy[eid].contactCd <= 0 && d < Enemy[eid].radius + 5 + 4) {
      Enemy[eid].contactCd = CONTACT_COOLDOWN;
    }
  }
}
