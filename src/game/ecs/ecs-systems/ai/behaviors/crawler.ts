/* crawler.ts — ползун: прячется, атакует при приближении. */

import { Position, Enemy, Direction } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const AMBUSH_TRIGGER_DIST = 40;

export class CrawlerBrain extends EnemyBrain {
  get aggroRange(): number {
    return 42;
  }

  update(ctx: AiContext, eid: number): void {
    const { dt } = ctx;
    const dx = ctx.playerX - Position[eid].x;
    const dy = ctx.playerY - Position[eid].y;
    const d2p = dx * dx + dy * dy;
    const d = Math.sqrt(d2p);
    const stopD = Enemy[eid].radius + 5 + 2;

    // Прячется — выскакивает когда игрок подошёл вплотную
    if (!!Enemy[eid].hidden) {
      if (d2p < AMBUSH_TRIGGER_DIST * AMBUSH_TRIGGER_DIST) {
        Enemy[eid].hidden = 0;
        Enemy[eid].aggro = 1;
      }
      return;
    }

    if (!!Enemy[eid].aggro) {
      const dd = Math.hypot(dx, dy) || 1;
      Direction[eid].x = dx / dd;
      Direction[eid].y = dy / dd;
      if (d > stopD) {
        // Путь через NavMesh — обходит уступы террас
        this.chaseTo(ctx, eid, ctx.playerX, ctx.playerY, Enemy[eid].speed);
      }
    } else {
      // Прячается, но если распуган далеко от дома — возвращается на место
      this.idleGround(ctx, eid, () => this.stop(eid));
    }
  }
}
