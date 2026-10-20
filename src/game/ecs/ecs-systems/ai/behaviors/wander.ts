/* wander.ts — мозг по умолчанию для незарегистрированных видов врагов.
 *
 * Возвращает врага домой по NavMesh-пути, иначе позволяет ему бродить.
 * Нужен как безопасный fallback (принцип открытости: новый вид не ломает систему).
 */

import { EnemyBrain, type AiContext } from '../brain';

export class WanderBrain extends EnemyBrain {
  update(ctx: AiContext, eid: number): void {
    this.idleGround(ctx, eid, () => this.stop(eid));
  }
}
