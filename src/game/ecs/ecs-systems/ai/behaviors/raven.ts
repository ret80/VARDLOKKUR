/* raven.ts — ворон: орбитальное поведение вокруг игрока + dive-атака. */

import { Position, Enemy, Velocity, Direction, EnemyState } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const DIVE_TRIGGER_DIST = 52;
const DIVE_TIME = 0.55;
const DIVE_SPEED_MUL = 2.2;
const HOVER_TIME = 1.4;

export class RavenBrain extends EnemyBrain {
  get aggroRange(): number {
    return 150;
  }

  update(ctx: AiContext, eid: number): void {
    const { dt } = ctx;
    const d = this.distToPlayer(ctx, eid);

    if (!!Enemy[eid].aggro) {
      if (Enemy[eid].state !== EnemyState.dive) {
        // Кружит по орбите, слегка смещая радиус
        Enemy[eid].stateT -= dt;
        const orbit = 34 + Math.sin(Enemy[eid].t * 2 + Enemy[eid].seed) * 8;
        const tang = Math.atan2(ctx.playerY - Position[eid].y, ctx.playerX - Position[eid].x) + Math.PI / 2;
        const radial = d > orbit ? 1 : -0.6;
        this.setVelocity(
          eid,
          Math.cos(tang) * Enemy[eid].speed * 0.8 + ((ctx.playerX - Position[eid].x) / (d || 1)) * Enemy[eid].speed * 0.5 * radial,
          Math.sin(tang) * Enemy[eid].speed * 0.8 + ((ctx.playerY - Position[eid].y) / (d || 1)) * Enemy[eid].speed * 0.5 * radial
        );
        // Пора нырять
        if (d < DIVE_TRIGGER_DIST && Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.dive;
          Enemy[eid].stateT = DIVE_TIME;
          const dd = Math.hypot(ctx.playerX - Position[eid].x, ctx.playerY - Position[eid].y) || 1;
          Direction[eid].x = (ctx.playerX - Position[eid].x) / dd;
          Direction[eid].y = (ctx.playerY - Position[eid].y) / dd;
        }
      } else {
        // Dive — летит по зафиксированному направлению
        Enemy[eid].stateT -= dt;
        this.setVelocity(
          eid,
          Direction[eid].x * Enemy[eid].speed * DIVE_SPEED_MUL,
          Direction[eid].y * Enemy[eid].speed * DIVE_SPEED_MUL
        );
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.hover;
          Enemy[eid].stateT = HOVER_TIME;
        }
      }
    } else {
      // Спокойный полёт на месте
      this.setVelocity(
        eid,
        Math.sin(Enemy[eid].t * 1.2 + Enemy[eid].seed) * 30,
        Math.cos(Enemy[eid].t * 0.9 + Enemy[eid].seed) * 24
      );
    }

    if (Velocity[eid].x !== 0) Direction[eid].x = Velocity[eid].x >= 0 ? 1 : -1;
  }
}
