/* swing-boss.ts — общий FSM боссов с тяжёлой атакой «замах → удар».
 *
 * Используется для Женца (Reaper) и Великана (Giant): у них одна и та же машина
 * состояний enter → chase → wind → swing → stuck, различаются только числами —
 * они описаны в `SwingBossTuning`.
 */

import { Position, Enemy, Health, EnemyState } from '../../../../ecs-components';
import { audio } from '../../../../../audio';
import { BossBrain } from './boss-brain';
import type { AiContext } from '../../brain';

export interface SwingBossTuning {
  /** Скорость во 2-й фазе (HP ≤ 50%). */
  phase2Speed: number;
  /** Длительность преследования до замаха (обычная / 2-я фаза). */
  chaseTime: [number, number];
  /** На каком расстоянии бросается на игрока. */
  lungeTriggerDist: number;
  /** Длительность замаха (обычная / 2-я фаза). */
  windTime: [number, number];
  /** Длительность удара. */
  swingTime: number;
  /** Длительность оглушения после удара (обычная / 2-я фаза). */
  stuckTime: [number, number];
  /** Урон во время удара (коса в полу); null — Giant не наносит урона ударом. */
  swingContact: { dmg: number; radius: number; cooldown: number } | null;
  /** Проигрывать swing-звук при замахе и ударе. */
  swingSound: boolean;
}

export class SwingBossBrain extends BossBrain {
  constructor(private readonly tuning: SwingBossTuning) {
    super();
  }

  protected updateBoss(ctx: AiContext, eid: number, d: number): void {
    const { dt } = ctx;
    const phase2 = this.isPhase2(eid);
    const spd = phase2 ? this.tuning.phase2Speed : Enemy[eid].speed;
    const [chaseNormal, chasePhase2] = this.tuning.chaseTime;

    Enemy[eid].stateT -= dt;

    switch (Enemy[eid].state) {
      case EnemyState.enter:
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.chase;
          Enemy[eid].stateT = phase2 ? chasePhase2 : chaseNormal;
        }
        break;

      case EnemyState.chase:
        if (d > Enemy[eid].radius + 5 + 4) {
          // Путь через NavMesh — обходит стены/колонны подземелья
          this.chaseTo(ctx, eid, ctx.playerX, ctx.playerY, spd);
        } else {
          this.stop(eid);
        }
        if (Enemy[eid].stateT <= 0 || d < this.tuning.lungeTriggerDist) {
          Enemy[eid].state = EnemyState.wind;
          Enemy[eid].stateT = phase2 ? this.tuning.windTime[1] : this.tuning.windTime[0];
          this.stop(eid);
          if (this.tuning.swingSound) audio.swing();
        }
        break;

      case EnemyState.wind:
        this.stop(eid);
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.swing;
          Enemy[eid].stateT = this.tuning.swingTime;
          if (this.tuning.swingSound) audio.swing();
        }
        break;

      case EnemyState.swing: {
        this.stop(eid);
        // Contact damage during swing (коса в полу)
        const sc = this.tuning.swingContact;
        if (sc && Enemy[eid].contactCd <= 0 && d < sc.radius) {
          ctx.onPlayerDamaged(sc.dmg, Position[eid].x, Position[eid].y);
          Enemy[eid].contactCd = sc.cooldown;
        }
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.stuck;
          Enemy[eid].stateT = phase2 ? this.tuning.stuckTime[1] : this.tuning.stuckTime[0];
        }
        break;
      }

      case EnemyState.stuck:
        this.stop(eid);
        if (Enemy[eid].stateT <= 0) {
          Enemy[eid].state = EnemyState.chase;
          Enemy[eid].stateT = phase2 ? chasePhase2 : chaseNormal;
        }
        break;
    }
  }
  private isPhase2(eid: number): boolean {
    return Health[eid].current <= Health[eid].max / 2;
  }
}
