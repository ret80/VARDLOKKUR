/* varg.ts — варг: лунг-атака + преследование по NavMesh. */

import { Enemy, Velocity, Direction } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const LUNGE_TRIGGER_DIST = 46;
const LUNGE_WINDUP = 0.35;
const LUNGE_SPEED_MUL = 2.0;

export class VargBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const { dt } = ctx;
    const d = this.distToPlayer(ctx, eid);
    const stopD = Enemy[eid].radius + 5 + 2;

    if (!!Enemy[eid].aggro) {
      this.facePlayer(ctx, eid);

      if (Enemy[eid].stateT > 0) {
        // Замах — рывок по направлению к игроку
        Enemy[eid].stateT -= dt;
        this.setVelocity(
          eid,
          Direction[eid].x * Enemy[eid].speed * LUNGE_SPEED_MUL,
          Direction[eid].y * Enemy[eid].speed * LUNGE_SPEED_MUL
        );
        if (Enemy[eid].stateT <= 0) Enemy[eid].lungeT = 1.0;
      } else if (d < LUNGE_TRIGGER_DIST && Enemy[eid].lungeT <= 0) {
        Enemy[eid].stateT = LUNGE_WINDUP;
      } else if (d > stopD + 1) {
        // Путь через NavMesh — обходит уступы террас
        this.chaseTo(ctx, eid, ctx.playerX, ctx.playerY, Enemy[eid].speed);
      }
    } else {
      this.idleGround(ctx, eid, () => {
        this.setVelocity(
          eid,
          Math.sin(Enemy[eid].t * 0.9 + Enemy[eid].seed) * Enemy[eid].speed * 0.35,
          Math.cos(Enemy[eid].t * 0.7 + Enemy[eid].seed) * Enemy[eid].speed * 0.35
        );
        if (Velocity[eid].x !== 0 || Velocity[eid].y !== 0) {
          const m = Math.hypot(Velocity[eid].x, Velocity[eid].y) || 1;
          Direction[eid].x = Velocity[eid].x / m;
          Direction[eid].y = Velocity[eid].y / m;
        }
      });
    }
  }
}
