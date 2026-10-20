/* ground-melee.ts — наземный боец ближнего боя.
 *
 * Используется для draugr, skeleton и frost — раньше это были три копии
 * одной и той же функции `update*`.
 */

import { Enemy, Velocity } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

export class GroundMeleeBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const d = this.distToPlayer(ctx, eid);
    const stopD = Enemy[eid].radius + 5 + 2;

    if (!!Enemy[eid].aggro) {
      // Путь через NavMesh — враги не упираются в уступы террас
      if (d > stopD + 1) {
        this.chaseTo(ctx, eid, ctx.playerX, ctx.playerY, Enemy[eid].speed);
      } else {
        this.stop(eid);
      }
      this.facePlayer(ctx, eid);
    } else {
      this.idleGround(ctx, eid, () => {
        if (Math.floor(Enemy[eid].t) % 4 === 0) {
          Velocity[eid].x = Math.sin(Enemy[eid].t * 0.7 + Enemy[eid].seed) * Enemy[eid].speed * 0.3;
          Velocity[eid].y = 0;
        } else {
          this.stop(eid);
        }
      });
    }
  }
}
