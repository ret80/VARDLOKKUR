/* skeleton-archer.ts — лучник-скелет: держит дистанцию, стреляет костяными стрелами. */

import { Position, Enemy, EnemyState } from '../../../ecs-components';
import { EnemyBrain, type AiContext } from '../brain';

const BOW_RANGE = 96;
const BOW_DRAW_TIME = 0.5;
const BOW_COOLDOWN = 1.5;
const BONE_ARROW_SPEED = 150;

export class SkeletonArcherBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    const { dt, bus } = ctx;
    const dx = ctx.playerX - Position[eid].x;
    const dy = ctx.playerY - Position[eid].y;
    const d = Math.hypot(dx, dy) || 1;

    this.faceTowards(eid, dx, dy);

    if (!Enemy[eid].aggro) {
      this.idleGround(ctx, eid, () => this.stop(eid));
      return;
    }

    // Держит дистанцию: подходит на выстрел, отходит если игрок слишком близко
    let moveX = 0;
    let moveY = 0;
    if (d > BOW_RANGE * 0.75) {
      const v = this.chaseVector(ctx, eid, ctx.playerX, ctx.playerY, Enemy[eid].speed);
      moveX = v.x;
      moveY = v.y;
    } else if (d < BOW_RANGE * 0.45) {
      const v = this.chaseVector(ctx, eid, ctx.playerX - dx * 2, ctx.playerY - dy * 2, Enemy[eid].speed * 0.8);
      moveX = -v.x;
      moveY = -v.y;
    }
    this.setVelocity(eid, moveX, moveY);

    // Натягивает тетиву → выстрел → перезарядка
    Enemy[eid].stateT -= dt;
    if (Enemy[eid].state === EnemyState.aim) {
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.cool;
        Enemy[eid].stateT = BOW_COOLDOWN;
        if (bus && d < BOW_RANGE * 1.2) {
          bus.emit('projectile:fire', {
            kind: 'bone_arrow',
            x: Position[eid].x,
            y: Position[eid].y - 4,
            vx: (dx / d) * BONE_ARROW_SPEED,
            vy: (dy / d) * BONE_ARROW_SPEED,
            dmg: Enemy[eid].dmg,
            owner: eid,
          });
        }
      }
    } else if (Enemy[eid].state === EnemyState.cool) {
      if (Enemy[eid].stateT <= 0) {
        Enemy[eid].state = EnemyState.aim;
        Enemy[eid].stateT = BOW_DRAW_TIME;
      }
    } else {
      Enemy[eid].state = EnemyState.aim;
      Enemy[eid].stateT = BOW_DRAW_TIME;
    }
  }
}
